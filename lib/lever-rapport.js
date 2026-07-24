// /lib/lever-rapport.js
// Gedeelde AFLEVERING van het Power Profile-rapport: PDF bouwen (vermogen of
// hartslag), de klantmail met bijlage sturen, jou een interne verkoopmelding
// sturen en de koper naar Mailchimp zetten (nurture met tegoed-linkje).
//
// Waarom apart? Twee plekken leveren hetzelfde rapport af:
//   1. /api/betaling-webhook  — na een betaalde Mollie-betaling (de normale weg)
//   2. /api/betaling          — bij een GRATIS servicelink (€0), die Mollie
//                               overslaat want Mollie kan geen €0 verwerken
// Door de afleverlogica hier te bundelen krijgt de gratis klant exact hetzelfde
// rapport en dezelfde mails als een betalende klant — één bron van waarheid.
//
// Deze module doet GEEN ontdubbeling/lock — dat regelt de aanroeper (de webhook
// via Redis op het Mollie-id, de gratis weg via de eenmalige kortingslink-id).
import crypto from 'node:crypto';
import { bouwRapportPdfHr } from './rapport-hr.js';

// Pas deze drie regels eventueel aan:
const INTERNE_MAIL = 'michel.kredercoaching@gmail.com';
const AFZENDER     = 'Michel Kreder Coaching <rapport@michelkredercoaching.nl>';
const REPLY_TO     = 'info@michelkredercoaching.nl';

const LOGO_B64 = '';

// ===== HELPERS: veilige tekst =====
function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
function veiligPdfTekst(s) {
  return String(s == null ? '' : s).replace(/[^\x20-\x7E\xA0-\xFF]/g, '').trim() || 'Sporter';
}
// Zet alle niet-ASCII tekens om naar numerieke HTML-entities, zodat mailclients
// ze altijd goed tonen (voorkomt mojibake ongeacht de charset).
function naarHtmlEntities(s) {
  return String(s).replace(/[^\x00-\x7F]/g, function(ch){ return "&#" + ch.charCodeAt(0) + ";"; });
}

// Controleert of een PNG structureel klopt VOORDAT pdf-lib 'm aanraakt.
function isGeldigePng(buf) {
  try {
    const SIG = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
    if (buf.length < 24 || !buf.subarray(0,8).equals(SIG)) return false;
    let i = 8, eind = false;
    while (i + 8 <= buf.length) {
      const len = buf.readUInt32BE(i);
      const type = buf.toString('latin1', i+4, i+8);
      if (!/^[A-Za-z]{4}$/.test(type)) return false;
      if (i + 12 + len > buf.length) return false;
      i += 12 + len;
      if (type === 'IEND') { eind = true; break; }
    }
    return eind;
  } catch { return false; }
}

// ---------- PDF: Power Profile-stijl ----------
async function bouwRapportPdf(meta) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const c = (hex) => { const n=parseInt(hex.replace('#',''),16); return rgb(((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255); };
  const BG=c('#0d0d0d'), CARD=c('#161616'), CARD2=c('#1a120c'), BORDER=c('#2b2b2b'), BORDERO=c('#48280f');
  const WIT=c('#fafafa'), MUT=c('#9a9a9a'), DIM=c('#6a6a6a'), ORANJE=c('#ff6b1a'), GROEN=c('#4caf80'), ROOD=c('#e87070');
  const TRACK=c('#262626');
  const ZONE_KLEUR=['#22c55e','#eab308','#ff6b1a','#3b82f6','#8b5cf6','#6b7280'];
  const ZONE_NAAM6=['Herstel','Duur','Tempo','Sweetspot','FTP','VO2max'];
  const ZONE_NAAM5=['Herstel','Duur','Tempo','Drempel','VO2max'];
  const doc = await PDFDocument.create();
  const PW=595.28, PH=841.89, M=40, R=PW-M;
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page, y;
  const nieuwePagina = () => { page = doc.addPage([PW,PH]); page.drawRectangle({x:0,y:0,width:PW,height:PH,color:BG}); y = PH - M; };
  nieuwePagina();
  const ensure = (nodig) => { if (y - nodig < 46) nieuwePagina(); };

  const txt=(s,x,yy,{font=reg,size=10,color=WIT,align='left'}={})=>{ s=String(s); let xx=x; if(align==='right')xx=x-font.widthOfTextAtSize(s,size); if(align==='center')xx=x-font.widthOfTextAtSize(s,size)/2; page.drawText(s,{x:xx,y:yy,size,font,color}); };
  const card=(x,yy,w,h,{fill=CARD,border=BORDER}={})=>page.drawRectangle({x,y:yy,width:w,height:h,color:fill,borderColor:border,borderWidth:1});
  const wrapTxt=(s,font,size,maxW)=>{ const words=s.split(' '),lines=[]; let line=''; for(const w of words){ const t=line?line+' '+w:w; if(font.widthOfTextAtSize(t,size)>maxW){lines.push(line);line=w;}else line=t;} if(line)lines.push(line); return lines; };

  const naam=veiligPdfTekst(meta.naam||'Sporter');
  const ftp=parseInt(meta.ftp)||null;
  const score=meta.score!=null&&meta.score!==''?meta.score:null;
  const uren=meta.uren!=null&&meta.uren!==''?Number(meta.uren):null;
  const vo2=meta.vo2max!=null&&meta.vo2max!==''?Number(meta.vo2max):null;
  const ritten=meta.ritten!=null&&meta.ritten!==''?Number(meta.ritten):null;
  const zones=(meta.zones||'').split('-').map(n=>parseInt(n)||0).filter((_,i)=>i<6);

  let logoGelukt = false;
  if (LOGO_B64 && LOGO_B64.length>20) {
    try {
      const logoBuf = Buffer.from(LOGO_B64,'base64');
      if (isGeldigePng(logoBuf)) {
        const logo=await doc.embedPng(logoBuf);
        const lw=120,lh=lw*(logo.height/logo.width);
        page.drawImage(logo,{x:M,y:y-lh+2,width:lw,height:lh});
        logoGelukt = true;
      } else { console.error('Logo overgeslagen: base64 is geen geldige PNG'); }
    } catch(e){ console.error('Logo embedden faalde:', e); }
  }
  if (!logoGelukt) txt('MICHEL KREDER COACHING',M,y-10,{font:bold,size:12});
  const datum=new Date().toLocaleDateString('nl-NL',{day:'numeric',month:'long',year:'numeric'});
  txt('POWER PROFILE™',R,y-2,{font:bold,size:8,color:DIM,align:'right'});
  txt(`Analyse · laatste 90 dagen${ritten?` · ${ritten} ritten`:''}`,R,y-14,{font:reg,size:8,color:DIM,align:'right'});
  txt(datum,R,y-26,{font:reg,size:8,color:DIM,align:'right'});
  y-=46;
  txt('Power Profile™',M,y-26,{font:bold,size:30});
  txt('Persoonlijk vermogensprofiel voor '+naam,M,y-42,{font:reg,size:10,color:MUT});
  if (score!=null){ txt(String(score),R,y-30,{font:bold,size:46,color:ORANJE,align:'right'}); txt('TRAINING SCORE',R,y-44,{font:bold,size:7,color:DIM,align:'right'}); }
  y-=58;
  txt('INZICHT.',M,y,{font:bold,size:10,color:WIT});
  txt(' TRAIN GERICHT.',M+bold.widthOfTextAtSize('INZICHT.',10),y,{font:bold,size:10,color:ORANJE});
  txt(' WORD STERKER.',M+bold.widthOfTextAtSize('INZICHT. TRAIN GERICHT.',10),y,{font:bold,size:10,color:WIT});
  y-=16; page.drawLine({start:{x:M,y},end:{x:R,y},thickness:1,color:BORDER}); y-=18;

  const namen=zones.length===5?ZONE_NAAM5:ZONE_NAAM6;
  const zoneCardH=34+namen.length*21+12;
  ensure(zoneCardH);
  card(M,y-zoneCardH,R-M,zoneCardH);
  txt('ZONEDISTRIBUTIE · WAAR TRAINDE JIJ?',M+16,y-20,{font:bold,size:9,color:WIT});
  const z=(i)=>zones[i]||0;
  const laagTot=z(0)+z(1), grijsTot=z(2)+z(3), kwalTot=z(4)+z(5), polen=laagTot+kwalTot;
  const kwalAandeel=polen>0?(kwalTot/polen)*100:0;
  const badgeVoor=(nm)=>{ if(nm==='FTP'||nm==='VO2max'||nm==='Drempel'){ if(kwalAandeel>=13&&kwalAandeel<=30)return 'goed'; return kwalAandeel<13?'laag':'hoog'; } if(nm==='Herstel'||nm==='Duur'){ if(laagTot>=75)return 'goed'; if(laagTot>=58)return 'ok'; return 'laag'; } if(nm==='Tempo'||nm==='Sweetspot')return grijsTot>12?'hoog':'ok'; return 'ok'; };
  const badgeTekst=(b)=>b==='goed'?'GOED':b==='laag'?'LAAG':b==='hoog'?'TE HOOG':'OK';
  const badgeKleur=(b)=>b==='goed'?GROEN:(b==='laag'||b==='hoog')?ORANJE:DIM;
  const grenzen=(i)=>{ if(!ftp)return ''; if(i===0)return `< ${Math.round(ftp*0.55)}W`; if(i===namen.length-1)return `> ${Math.round(ftp*1.05)}W`; const p=[[0,0.55],[0.55,0.75],[0.75,0.85],[0.85,0.95],[0.95,1.05]]; const [lo,hi]=p[i]; return `${Math.round(ftp*lo)}–${Math.round(ftp*hi)}W`; };
  const maxPct=Math.max(...zones,1), barX=M+150, barW=R-barX-110;
  namen.forEach((nm,i)=>{ const cy=y-38-i*21; txt(nm,M+16,cy,{font:bold,size:9.5,color:WIT}); txt(grenzen(i),M+86,cy,{font:reg,size:7.5,color:DIM}); page.drawRectangle({x:barX,y:cy-2,width:barW,height:7,color:TRACK}); const fw=Math.max(barW*(z(i)/Math.max(maxPct,1)),z(i)>0?3:0); if(fw>0)page.drawRectangle({x:barX,y:cy-2,width:fw,height:7,color:c(ZONE_KLEUR[i]||'#6b7280')}); txt(`${z(i)}%`,barX+barW+26,cy,{font:bold,size:9,color:MUT,align:'right'}); const b=badgeVoor(nm); const bx=R-58; page.drawRectangle({x:bx,y:cy-3,width:54,height:13,color:CARD,borderColor:badgeKleur(b),borderWidth:0.8}); txt(badgeTekst(b),bx+27,cy,{font:bold,size:7,color:badgeKleur(b),align:'center'}); });
  y-=zoneCardH+14;

  const ftpH=92; ensure(ftpH);
  card(M,y-ftpH,R-M,ftpH,{fill:CARD2,border:BORDERO});
  txt('FTP DETECTOR™',M+16,y-20,{font:bold,size:9,color:ORANJE});
  txt(ftp?String(ftp):'—',M+16,y-58,{font:bold,size:40,color:WIT});
  if(ftp)txt('WATT',M+16+bold.widthOfTextAtSize(String(ftp),40)+8,y-58,{font:bold,size:13,color:DIM});
  let betr='hoog', betrK=GROEN;
  const bron = meta.ftpBetrouwbaarheid;
  if (bron === 'laag') {
    betr='schatting'; betrK=ORANJE;
  } else if (bron === 'hoog') {
    if (ritten!=null && ritten<8) { betr='gemiddeld'; betrK=ORANJE; }
    else { betr='hoog'; betrK=GROEN; }
  } else if (ritten!=null) {
    if (ritten>=15){betr='hoog';betrK=GROEN;}
    else if (ritten>=8){betr='gemiddeld';betrK=ORANJE;}
    else {betr='laag';betrK=ROOD;}
  }
  txt(`Berekend uit ${ritten!=null?ritten:'—'} ritten`,M+16,y-76,{font:reg,size:8.5,color:MUT});
  txt('Betrouwbaarheid: ',R-16-bold.widthOfTextAtSize(betr,8.5),y-20,{font:reg,size:8.5,color:MUT,align:'right'});
  txt(betr,R-16,y-20,{font:bold,size:8.5,color:betrK,align:'right'});
  const pillW=128; page.drawRectangle({x:R-16-pillW,y:y-72,width:pillW,height:20,color:ORANJE});
  txt('GEEN FTP-TEST NODIG',R-16-pillW/2,y-66,{font:bold,size:8,color:WIT,align:'center'});
  y-=ftpH+14;

  // ===== W/KG CARD — Watt per kilo + Tour-vergelijking =====
  const wGew = (() => { const w = parseFloat(meta.weight); return (w >= 35 && w <= 200) ? w : null; })();
  if (ftp && wGew) {
    const wkg = ftp / wGew;
    const WKG_REF = 6.2;
    const TREDES = [['Recreant',0,2.5],['Getrainde amateur',2.5,3.2],['Snelle amateur',3.2,4.0],['Wedstrijdrenner',4.0,4.8],['Continental / elite',4.8,5.5],['WorldTour',5.5,99]];
    let actief = TREDES.findIndex(t => wkg >= t[1] && wkg < t[2]); if (actief === -1) actief = TREDES.length - 1;
    const pctTour = Math.round((wkg / WKG_REF) * 100);
    let volgLines;
    if (actief < TREDES.length - 1) {
      const v = TREDES[actief+1], wattNodig = Math.round(v[1]*wGew), erbij = Math.max(1, wattNodig - ftp);
      volgLines = wrapTxt(`Volgende trede: ${v[0]} (${v[1].toFixed(1)} W/kg) = FTP ${wattNodig}W, dus ${erbij}W erbij. Met gericht trainen haalbaar.`, reg, 8.5, R-M-32);
    } else {
      volgLines = wrapTxt('Je zit in de hoogste categorie — WorldTour-niveau. Chapeau.', reg, 8.5, R-M-32);
    }
    const piek1 = parseInt(meta.piek1min)||null, piek5 = parseInt(meta.piek5min)||null, piek12 = parseInt(meta.piek12min)||null, piek20 = parseInt(meta.piek20min)||null;
    const curve = [['1 min',piek1],['5 min',piek5],['12 min',piek12],['20 min',piek20]].filter(pp => pp[1] && pp[1] > 0);
    const ladderRijH = 15;
    const wkgH = 192 + volgLines.length*11 + (curve.length ? (13 + curve.length*13) : 0) + 14;
    ensure(wkgH);
    card(M, y-wkgH, R-M, wkgH, {fill:CARD2, border:BORDERO});
    txt('WATT PER KILO', M+16, y-20, {font:bold, size:9, color:ORANJE});
    txt(wkg.toFixed(1), M+16, y-52, {font:bold, size:34, color:WIT});
    txt('W/kg', M+16+bold.widthOfTextAtSize(wkg.toFixed(1),34)+8, y-52, {font:bold, size:12, color:DIM});
    let tx = M+16;
    txt('Jij trapt op ', tx, y-70, {font:reg, size:9, color:MUT}); tx += reg.widthOfTextAtSize('Jij trapt op ', 9);
    txt(`${pctTour}%`, tx, y-70, {font:bold, size:9, color:ORANJE}); tx += bold.widthOfTextAtSize(`${pctTour}%`, 9);
    txt(` van een Tour de France-klimmer (${WKG_REF} W/kg).`, tx, y-70, {font:reg, size:9, color:MUT});
    TREDES.forEach((t, i) => {
      const isA = i === actief;
      const rijY = y-88 - i*ladderRijH;
      if (isA) page.drawRectangle({x:M+12, y:rijY-4, width:R-M-24, height:13, color:c('#2a1508'), borderColor:ORANJE, borderWidth:0.8});
      const range = t[2] >= 99 ? `${t[1].toFixed(1)}+` : `${t[1].toFixed(1)}–${t[2].toFixed(1)}`;
      const rTxt = `${range} W/kg`;
      txt(t[0], M+18, rijY, {font:isA?bold:reg, size:9, color:isA?WIT:MUT});
      txt(rTxt, R-18, rijY, {font:isA?bold:reg, size:8.5, color:isA?ORANJE:DIM, align:'right'});
      if (isA) txt('JIJ', R-18-bold.widthOfTextAtSize(rTxt,8.5)-10, rijY, {font:bold, size:7, color:ORANJE, align:'right'});
    });
    const vy = y-88 - TREDES.length*ladderRijH - 2;
    volgLines.forEach((ln, idx) => txt(ln, M+16, vy-idx*11, {font:reg, size:8.5, color:MUT}));
    if (curve.length) {
      let cy = vy - volgLines.length*11 - 12;
      txt('JOUW POWER CURVE (W/kg)', M+16, cy, {font:bold, size:7.5, color:DIM}); cy -= 13;
      const maxWv = Math.max(...curve.map(pp => pp[1]/wGew));
      const cbarX = M+70, cbarW = R-cbarX-70;
      curve.forEach(pp => {
        const wv = pp[1]/wGew, fw = Math.max(cbarW*(wv/maxWv), 3);
        txt(pp[0], M+16, cy, {font:reg, size:8.5, color:MUT});
        page.drawRectangle({x:cbarX, y:cy-2, width:cbarW, height:6, color:TRACK});
        page.drawRectangle({x:cbarX, y:cy-2, width:fw, height:6, color:ORANJE});
        txt(`${wv.toFixed(1)} W/kg`, R-16, cy, {font:bold, size:8.5, color:MUT, align:'right'});
        cy -= 13;
      });
    }
    y -= wkgH + 14;
  }

  if (vo2!=null && Number(vo2)===0) {
    const lines=wrapTxt('In 90 dagen deed je 0 VO2max-sessies. Dit is meestal de hoofdoorzaak van een prestatieplateau — je motor krijgt geen groeiprikkel.',reg,9.5,R-M-32);
    const kh=24+lines.length*13+10; ensure(kh);
    card(M,y-kh,R-M,kh,{fill:c('#1c1010'),border:c('#5a2424')});
    txt('KRITIEKE BEVINDING',M+16,y-18,{font:bold,size:8,color:ROOD});
    lines.forEach((ln,idx)=>txt(ln,M+16,y-32-idx*13,{font:reg,size:9.5,color:c('#d8b0b0')}));
    y-=kh+14;
  }

  const w110=ftp?Math.round(ftp*1.1):null;
  const acties=[
    'Train minimaal 3x per week — consistent, elke week, geen uitzonderingen.',
    ftp?`Voeg 1x per week een VO2max-blok toe: 4×4 min boven ${w110}W met 3 min herstel.`:'Voeg 1x per week een VO2max-blok toe: 4×4 min hard met 3 min herstel.',
    'Zet je trainingen vast in je agenda: bv. di duur, do VO2max, zo lange rustige rit.'
  ];
  const actLines=acties.map(a=>wrapTxt(a,reg,9.5,R-M-58));
  const actH=24+actLines.reduce((s,l)=>s+Math.max(l.length*12,12)+8,0)+6;
  ensure(actH);
  card(M,y-actH,R-M,actH);
  txt('JOUW ACTIEPLAN',M+16,y-18,{font:bold,size:9,color:WIT});
  let ay=y-36;
  actLines.forEach((lines,i)=>{ page.drawCircle({x:M+24,y:ay-3,size:9,color:ORANJE}); txt(String(i+1),M+24,ay-6,{font:bold,size:8,color:WIT,align:'center'}); lines.forEach((ln,idx)=>txt(ln,M+44,ay-idx*12,{font:reg,size:9.5,color:MUT})); ay-=Math.max(lines.length*12,12)+8; });
  y-=actH+14;

  const meerVolume = (uren||0) >= 8;
  const wB=(lo,hi)=> ftp ? `${Math.round(ftp*lo)}–${Math.round(ftp*hi)}W` : `${Math.round(lo*100)}–${Math.round(hi*100)}% FTP`;
  const blokken=[];
  if (meerVolume){
    blokken.push({type:'DUURKRACHT — DREMPELBLOK · 1X PER WEEK', oms:`5x8 min op ${wB(0.70,0.75)} · 4 min rust tussen sets`, det:'Bouwt je aerobe motor en drempel zonder je leeg te trekken. Comfortabel zwaar — je kunt nog korte zinnen praten. Één keer per week is genoeg.'});
    blokken.push({type:'VO2MAX — OPTIE A · LANGE MICRO-INTERVALLEN', oms:`40-20 op ${wB(1.30,1.40)} · 2–3 blokken van 8–12 min, 5 min rust`, det:'40 sec vol, 20 sec rustig dóórdraaien. Je hartslag blijft hoog over het hele blok — maximale prikkel voor je zuurstofopname. 1x per week.'});
    blokken.push({type:'VO2MAX — OPTIE B · LANGERE REPS', oms:`80-40 op ${wB(1.10,1.20)} · 2–3 blokken van 8–12 min, 5 min rust`, det:'Langere inspanningen op een lager percentage. Goed alternatief als de 40-20 te zwaar voelt, of voor variatie. Kies één optie per week.'});
  } else {
    blokken.push({type:'DUURKRACHT — DREMPELBLOK · 1X PER WEEK', oms:`5x5 min op ${wB(0.70,0.75)} · 3 min rust tussen sets`, det:'De efficiënte manier om je aerobe basis te bouwen als je weinig tijd hebt. Comfortabel zwaar, niet vol. Één keer per week — vaker is niet nodig.'});
    blokken.push({type:'VO2MAX — OPTIE A · KORTE MICRO-INTERVALLEN', oms:`20-10 op ${wB(1.10,1.30)} · 2–3 blokken van 8–12 min, 5 min rust`, det:'20 sec aan, 10 sec uit. Toegankelijk maar effectief — je houdt het vol terwijl de prikkel hoog blijft. Ideaal als je minder fietst. 1x per week.'});
    blokken.push({type:'VO2MAX — OPTIE B · PITTIGER', oms:`30-30 op ${wB(1.20,1.50)} · 2–3 blokken van 8–12 min, 5 min rust`, det:'30 sec stevig, 30 sec rustig. Iets meer bite dan de 20-10. Kies één van beide opties per week voor afwisseling.'});
  }
  ensure(30);
  txt('INTERVALBLOKKEN VOOR JOUW NIVEAU',M,y,{font:bold,size:9,color:WIT}); y-=14;
  blokken.forEach(b=>{
    const detLines=wrapTxt(b.det,reg,8.5,R-M-32);
    const h=14+11+6+13+6+detLines.length*11+12;
    ensure(h+6);
    card(M,y-h,R-M,h);
    txt(b.type,M+16,y-18,{font:bold,size:8,color:ORANJE});
    txt(b.oms,M+16,y-34,{font:bold,size:11,color:WIT});
    detLines.forEach((ln,idx)=>txt(ln,M+16,y-50-idx*11,{font:reg,size:8.5,color:MUT}));
    y-=h+8;
  });
  y-=6;

  const ctaH=58; ensure(ctaH+24);
  card(M,y-ctaH,R-M,ctaH,{fill:CARD2,border:BORDERO});
  txt('VAN INZICHT NAAR UITVOERING',M+16,y-18,{font:bold,size:9,color:ORANJE});
  txt('Een persoonlijk trainingsschema vertaalt dit rapport naar week-voor-week training — vanaf €59.',M+16,y-34,{font:reg,size:9,color:MUT});
  txt('michelkredercoaching.nl/trainingsschemas',M+16,y-49,{font:bold,size:9,color:WIT});

  txt('Power Profile™ · Michel Kreder Coaching · momentopname op basis van je Strava-data.',M,26,{font:reg,size:7,color:DIM});

  return await doc.save();
}

export function kapitaal(s){ s=String(s||'').trim(); return s ? s.charAt(0).toUpperCase()+s.slice(1) : 'Sporter'; }

// Aanbevolen schema (duur + niveau) + prijzen, zodat de mail net als het rapport
// "Opbouw 12-wekenplan" met de juiste (doorgestreepte) prijs kan tonen.
// Staffel per schemaduur (juli 2026): 8 weken €5, 12 en 16 weken €10.
const TEGOED_PER_WEKEN = { 8: 5, 12: 10, 16: 10 };
const PRIJS_MATRIX = {
  8:  { basis: 39, opbouw: 49, piek: 59 },
  12: { basis: 59, opbouw: 69, piek: 79 },
  16: { basis: 79, opbouw: 89, piek: 99 }
};
function aanbevolenWeken(uren) {
  const u = Number(uren) || 0;
  if (u >= 8.5) return 16;
  if (u >= 4.5) return 12;
  return 8;
}
// Niveau schatten uit W/kg (FTP ÷ gewicht); zonder gewicht op de prestatiescore.
function aanbevolenNiveau(m) {
  const ftp = parseInt(m.ftp) || 0;
  const w = parseFloat(m.weight) || 0;
  if (w >= 35 && w <= 200 && ftp) {
    const wkg = ftp / w;
    if (wkg < 2.8) return 'Basis';
    if (wkg < 3.8) return 'Opbouw';
    return 'Piek';
  }
  const score = Number(m.score) || 0;
  if (score < 45) return 'Basis';
  if (score < 70) return 'Opbouw';
  return 'Piek';
}
function bepaalAdvies(m) {
  const weken = aanbevolenWeken(m.uren);
  const niveau = aanbevolenNiveau(m);
  const tegoed = TEGOED_PER_WEKEN[weken] || 5;
  const origPrijs = (PRIJS_MATRIX[weken] && PRIJS_MATRIX[weken][niveau.toLowerCase()]) || null;
  const finalPrijs = origPrijs != null ? Math.max(0, origPrijs - tegoed) : null;
  return { weken, niveau, tegoed, origPrijs, finalPrijs };
}

function klantHtml(naam, token, deadline, advies, isHartslag) {
  const veiligeNaam = escHtml(naam);
  const schemaUrl = token
    ? `https://michelkredercoaching.nl/trainingsschemas/?pp=${encodeURIComponent(token)}`
    : 'https://michelkredercoaching.nl/trainingsschemas';
  const deadlineTxt = deadline ? escHtml(deadline) : '';
  const a = advies || {};
  // Spoor-bewuste woorden: een hartslag-koper heeft geen FTP maar een omslagpunt,
  // en zijn grijze middenzone is D2 (niet Tempo/Sweetspot).
  const kernGetal = isHartslag ? 'omslagpunt' : 'FTP';
  const grijsZone = isHartslag ? 'D2, je tempo-zone' : 'Tempo/Sweetspot';
  const kernRegel = isHartslag ? 'Je omslagpunt' : 'Je FTP';
  const prijsRegel = (a.origPrijs != null && a.finalPrijs != null)
    ? ` Van <span style="text-decoration:line-through;color:#8a8a8a;">€${a.origPrijs}</span> naar <strong style="color:#ff6b1a;">€${a.finalPrijs}</strong> met je €${a.tegoed} tegoed.`
    : ` Jouw tegoed: <strong style="color:#ff6b1a;">€${a.tegoed}</strong>.`;
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;line-height:1.65;max-width:560px;">
    <p style="font-size:16px;margin:0 0 14px;">Hi ${veiligeNaam},</p>
    <p style="font-size:15px;margin:0 0 14px;">Je rapport zit als PDF bij deze mail, met je ${kernGetal}, je zones en je actieplan. Maar één ding eerst.</p>
    <p style="font-size:15px;margin:0 0 18px;">Kijk naar je percentage in het <strong>grijze gebied</strong> (${grijsZone}). Dat ene getal verklaart bij de meeste renners waarom ze hard trainen zonder sneller te worden. Te zwaar om van te herstellen, te licht om van te groeien.</p>

    <div style="margin:22px 0;padding:22px;background:#0d0d0d;border-radius:12px;">
      <p style="font-size:12px;font-weight:800;color:#ff6b1a;letter-spacing:1.5px;margin:0 0 10px;text-transform:uppercase;">Je analyse-tegoed staat klaar</p>
      <p style="font-size:18px;line-height:1.4;color:#ffffff;margin:0 0 8px;font-weight:800;">Je hebt nu de diagnose. Tijd voor de behandeling.</p>
      <p style="font-size:14px;color:#c8c8c8;margin:0 0 14px;">Je analyse levert je korting op op elk trainingsschema. Kies er één en het wordt automatisch verrekend.</p>
      <p style="font-size:15px;color:#ffffff;margin:0 0 16px;">Ons advies: het <strong style="color:#ff6b1a;">${a.niveau} ${a.weken}-wekenplan</strong>.${prijsRegel}</p>
      <a href="${schemaUrl}" style="display:inline-block;background:#ff6b1a;color:#ffffff;text-decoration:none;font-weight:800;font-size:16px;padding:14px 30px;border-radius:8px;">Verzilver mijn tegoed →</a>
      ${deadlineTxt ? `<p style="font-size:12px;color:#8a8a8a;margin:14px 0 0;">Let op: je tegoed vervalt ${deadlineTxt}. Daarna geldt het volle tarief.</p>` : ''}
    </div>

    <p style="font-size:15px;margin:0 0 8px;">Open je rapport daarna in deze volgorde:</p>
    <table cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
      <tr><td style="font-size:15px;padding:3px 10px 3px 0;font-weight:700;color:#ff6b1a;vertical-align:top;">1.</td><td style="font-size:15px;padding:3px 0;"><strong>${kernRegel}:</strong> vanaf nu de referentie voor elke training</td></tr>
      <tr><td style="font-size:15px;padding:3px 10px 3px 0;font-weight:700;color:#ff6b1a;vertical-align:top;">2.</td><td style="font-size:15px;padding:3px 0;"><strong>Je actieplan:</strong> 3 stappen. Begin deze week met stap 1.</td></tr>
      <tr><td style="font-size:15px;padding:3px 10px 3px 0;font-weight:700;color:#ff6b1a;vertical-align:top;">3.</td><td style="font-size:15px;padding:3px 0;"><strong>De intervalblokken:</strong> kies er één en zet 'm in je agenda</td></tr>
    </table>
    <p style="font-size:15px;margin:0 0 18px;"><strong>Een rapport dat je leest verandert niets. Een rapport dat je uitvoert wel.</strong> De renners die over 6 weken verschil voelen, pakken vandaag hun schema, nu het tegoed er nog op zit.</p>
    <p style="font-size:14px;margin:0 0 4px;">Vragen over je cijfers? Reageer gewoon op deze mail, ik lees alles zelf.</p>
    <p style="font-size:14px;margin:18px 0 0;color:#666;">Sterke kilometers,<br><strong style="color:#1a1a1a;">Michel</strong><br>Michel Kreder Coaching</p>
  </div>`;
  return naarHtmlEntities(html);
}

function interneHtml(m, bedrag, id, pdfErbij) {
  const r=(label,val)=>`<tr><td style="padding:4px 16px 4px 0;color:#666;">${label}</td><td style="padding:4px 0;font-weight:700;">${val}</td></tr>`;
  const watt=(v)=>{ const n=parseInt(v); return n>0 ? escHtml(String(n))+' W' : '—'; };
  const statusBalk = pdfErbij
    ? `<p style="margin:16px 0 0;padding:10px 14px;border-radius:6px;background:#eef7f0;color:#2e7d4f;font-size:14px;font-weight:600;">📎 PDF zit als bijlage bij deze mail — klaar om te forwarden naar de klant.</p>`
    : `<p style="margin:16px 0 0;padding:10px 14px;border-radius:6px;background:#fdecea;color:#c0392b;font-size:14px;font-weight:600;">⚠ PDF kon NIET worden gegenereerd. De klant heeft (nog) niets ontvangen — check handmatig.</p>`;
  return naarHtmlEntities(`
  <div style="font-family:Arial,sans-serif;color:#111;line-height:1.6;">
    <h2 style="margin:0 0 4px;">🚴 Nieuwe verkoop</h2>
    <p style="margin:0 0 16px;color:#666;">Power Profile™ · ${escHtml(bedrag)} betaald</p>
    <table style="border-collapse:collapse;font-size:15px;">
      ${r('Naam', escHtml(m.naam||'Sporter'))}
      ${r('E-mail', escHtml(m.email||'—'))}
      ${r('Meetmethode', escHtml(m.meetmethode==='hartslag' ? 'hartslag (omslagpunt)' : 'vermogen (FTP)'))}
      ${r('FTP', escHtml((m.ftp||'?'))+' W')}
      ${r('FTP-betrouwbaarheid', escHtml(m.ftpBetrouwbaarheid||'—'))}
      ${r('Omslagpunt', m.omslagpunt ? escHtml(m.omslagpunt)+' bpm' : '—')}
      ${r('HR-piek 12 min', m.piek12minHr ? escHtml(m.piek12minHr)+' bpm' : '—')}
      ${r('HR-piek 20 min', m.piek20minHr ? escHtml(m.piek20minHr)+' bpm' : '—')}
      ${r('Piek 1 min', watt(m.piek1min))}
      ${r('Piek 5 min', watt(m.piek5min))}
      ${r('Piek 12 min', watt(m.piek12min))}
      ${r('Piek 20 min', watt(m.piek20min))}
      ${r('Gewicht', m.weight ? escHtml(m.weight)+' kg' : '—')}
      ${r('Ritten (90 dgn)', m.ritten!=null&&m.ritten!==''?escHtml(m.ritten):'—')}
      ${r('Uren/week', m.uren!=null?escHtml(m.uren):'?')}
      ${r('Trainingsscore', m.score!=null?escHtml(m.score):'?')}
      ${r('VO2max-sessies', m.vo2max!=null?escHtml(m.vo2max):'?')}
      ${r('Gem. intensiteit', m.intensiteit!=null&&m.intensiteit!==''?escHtml(m.intensiteit)+'%':'—')}
      ${r('Herstelbalans', m.herstel!=null?escHtml(m.herstel)+'/10':'—')}
      ${r('Zones', escHtml(m.zones||'—'))}
    </table>
    ${statusBalk}
    <p style="margin:16px 0 0;color:#999;font-size:12px;">Mollie betaling-id: ${escHtml(id)}</p>
  </div>`);
}

async function stuurMail(payload) {
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method:'POST',
      headers:{ Authorization:`Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type':'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000)
    });
    if (!r.ok) { console.error('Resend fout:', r.status, await r.text()); return false; }
    console.log('Resend OK ->', payload.to, '|', payload.subject);
    return true;
  } catch (e) { console.error('Resend exception:', e); return false; }
}

// ===== NURTURE: koper naar Mailchimp + versleuteld tegoed-linkje =====
const MC_KEY    = process.env.MAILCHIMP_API_KEY;      // ...-usXX
const MC_LIST   = process.env.MAILCHIMP_LIST_ID;
const MC_DC     = MC_KEY ? MC_KEY.split('-')[1] : null;
const PP_SECRET = process.env.PP_TOKEN_SECRET || '';  // handtekening-sleutel (ook in het WordPress-snippet)

// Pijnpunt uit de analyse (mirror van het rapport).
function bepaalPijn(m) {
  const z = (m.zones || '').split('-').map(n => parseInt(n) || 0);
  const grijs = (z[2]||0) + (z[3]||0);   // Tempo + Sweetspot
  const laag  = (z[0]||0) + (z[1]||0);   // Herstel + Duur
  const kwal  = (z[4]||0) + (z[5]||0);   // FTP + VO2max
  const vo2   = Number(m.vo2max);
  if (!Number.isNaN(vo2) && vo2 === 0) return { pijn: 'interval', pct: kwal };
  if (grijs > 20)                      return { pijn: 'grijs',    pct: grijs };
  if (laag < 70)                       return { pijn: 'duur',     pct: laag };
  return { pijn: 'grijs', pct: grijs };
}

// 23:59 (Amsterdam) op de dag die 'dagen' dagen na nu valt. DST-proof: de
// Amsterdam-offset (zomer +2 / winter +1) leiden we af uit 12:00 UTC op de
// doeldatum, ruim weg van de nachtelijke DST-overgang, dus betrouwbaar.
function eindeVanDagAmsterdam(dagen) {
  const doel = new Date(Date.now() + dagen * 24 * 3600 * 1000);
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(doel);
  const [y, m, d] = ymd.split('-').map(Number);
  const amsUur = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', hour: '2-digit', hour12: false }).format(new Date(Date.UTC(y, m - 1, d, 12))));
  const offset = amsUur - 12;                            // +2 (zomer) of +1 (winter)
  return new Date(Date.UTC(y, m - 1, d, 23 - offset, 59, 0));
}

// Versleuteld tegoed-linkje. WordPress verifieert de handtekening en past dán zelf
// de juiste korting toe — Vercel hoeft WooCommerce niet te bellen. De deadline is
// EINDE VAN DAG 3 (23:59 Amsterdam), niet exact 72u na aankoop, zodat "vandaag /
// tot vanavond" in mail 3 klopt ongeacht het tijdstip van bestellen.
function maakToken(email) {
  if (!PP_SECRET || !email) return { token: '', deadlineNL: '' };
  const deadline = eindeVanDagAmsterdam(3);
  const exp = deadline.getTime() + 24 * 3600 * 1000;    // token nog 1 dag ná de deadline geldig (buffer)
  const payload = `${String(email).toLowerCase()}|${exp}`;
  const sig = crypto.createHmac('sha256', PP_SECRET).update(payload).digest('hex').slice(0, 16);
  const token = Buffer.from(`${payload}|${sig}`).toString('base64url');
  const deadlineNL = deadline.toLocaleString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' });
  return { token, deadlineNL };
}

// Koper + pijnpunt + tegoed-token + schema-advies naar Mailchimp (Keuzehulp-audience).
async function naarMailchimp(m, token, deadlineNL, advies) {
  if (!MC_KEY || !MC_LIST || !MC_DC || !m.email) { console.log('Mailchimp overslaan (config/email mist)'); return; }
  const { pijn, pct } = bepaalPijn(m);
  const hash = crypto.createHash('md5').update(String(m.email).toLowerCase()).digest('hex');
  const base = `https://${MC_DC}.api.mailchimp.com/3.0/lists/${MC_LIST}`;
  const auth = 'Basic ' + Buffer.from('any:' + MC_KEY).toString('base64');
  try {
    await fetch(`${base}/members/${hash}`, {
      method: 'PUT',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email_address: m.email,
        status_if_new: 'subscribed',
        merge_fields: {
          FNAME: m.naam ? m.naam.trim().replace(/\b\p{L}/gu, c => c.toUpperCase()) : '', FTP: m.ftp || '', SCORE: m.score || '',
          PIJN: pijn, PIJNPCT: String(pct),
          MEETMETH: m.meetmethode === 'hartslag' ? 'hartslag' : 'vermogen',
          PPTOKEN: token || '',
          DEADLINE: deadlineNL || '',
          ADVSCHEMA: advies ? `${advies.niveau} ${advies.weken}-wekenplan` : '',
          ADVOUD:    advies && advies.origPrijs  != null ? String(advies.origPrijs)  : '',
          ADVNIEUW:  advies && advies.finalPrijs != null ? String(advies.finalPrijs) : '',
          ADVTEGOED: advies ? String(advies.tegoed) : ''
        }
      }),
      signal: AbortSignal.timeout(10000)
    });
    // Tag eerst weghalen: alleen een NIEUW geplaatste tag triggert de koper-journey,
    // zodat ook een herhaalkoper de tegoed-mails weer krijgt (journey: re-enter aan).
    await fetch(`${base}/members/${hash}/tags`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: [{ name: 'power-profile-koper', status: 'inactive' }] }),
      signal: AbortSignal.timeout(10000)
    });
    await fetch(`${base}/members/${hash}/tags`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: [{ name: 'power-profile-koper', status: 'active' }, { name: 'pijn-' + pijn, status: 'active' }] }),
      signal: AbortSignal.timeout(10000)
    });
    console.log('Mailchimp OK:', m.email, '| pijn:', pijn, '| token:', token ? 'ja' : 'nee');
  } catch (e) { console.error('Mailchimp faalde (blokkeert niet):', e); }
}

// ===== HOOFDFUNCTIE: rapport afleveren =====
// Bouwt de PDF (vermogen of hartslag), mailt 'm naar de klant, stuurt jou de
// interne verkoopmelding en zet de koper in Mailchimp. Doet GEEN ontdubbeling —
// dat regelt de aanroeper. Geeft terug wat er gelukt is, zodat de webhook kan
// beslissen over een retry en de gratis-weg een nette foutmelding kan tonen.
//   { pdfOk, klantMailGelukt, interneGelukt }
export async function leverRapport(m, { bedrag, id } = {}) {
  const naam = kapitaal(m.naam);
  const veiligeBestandsnaam = String(naam).replace(/[^a-z0-9]/gi,'_').slice(0,40) || 'sporter';

  // Tegoed-token vast berekenen: gebruikt in de klantmail (korting-knop) én in Mailchimp.
  const { token: ppToken, deadlineNL: ppDeadline } = maakToken(m.email);
  // Aanbevolen schema (duur + niveau + prijzen) voor de mail.
  const advies = bepaalAdvies(m);

  // PDF bouwen — de kern van het rapport. Kies het spoor: een hartslag-renner
  // (geen/te weinig vermogensdata) krijgt het omslagpunt-rapport, de rest het
  // vermogens-rapport. meetmethode komt uit de Mollie-metadata / betaal-data.
  const isHartslag = m.meetmethode === 'hartslag';
  let pdfB64 = null;
  try {
    const bytes = isHartslag ? await bouwRapportPdfHr(m) : await bouwRapportPdf(m);
    pdfB64 = Buffer.from(bytes).toString('base64');
    console.log(`PDF gebouwd (${isHartslag ? 'hartslag' : 'vermogen'}):`, bytes.length, 'bytes');
  } catch (e) { console.error('PDF genereren faalde:', e); }

  if (!pdfB64) return { pdfOk: false, klantMailGelukt: false, interneGelukt: false };

  // Klantmail met de PDF.
  let klantMailGelukt = false;
  if (m.email) {
    klantMailGelukt = await stuurMail({
      from: AFZENDER, to: m.email, reply_to: REPLY_TO,
      subject: 'Je rapport staat klaar, en je analyse-tegoed ook',
      html: klantHtml(naam, ppToken, ppDeadline, advies, isHartslag),
      attachments: [{ filename: 'Power-Profile-trainingsrapport.pdf', content: pdfB64 }]
    });
  }

  // Interne mail MÉT de PDF als bijlage — jouw kopie, met één herkansing.
  const internePayload = {
    from: AFZENDER, to: INTERNE_MAIL,
    subject: `Nieuwe verkoop - ${naam} - ${isHartslag ? `omslagpunt ${m.omslagpunt||'?'} bpm` : `FTP ${m.ftp||'?'}W`}`,
    html: interneHtml(m, bedrag, id, true),
    attachments: [{ filename: `Power-Profile-${veiligeBestandsnaam}.pdf`, content: pdfB64 }]
  };
  let interneGelukt = await stuurMail(internePayload);
  if (!interneGelukt) interneGelukt = await stuurMail(internePayload);

  // NURTURE — koper + versleuteld tegoed-linkje naar Mailchimp (blokkeert niet).
  try {
    await naarMailchimp(m, ppToken, ppDeadline, advies);
  } catch (e) { console.error('Nurture-stap faalde (blokkeert niet):', e); }

  return { pdfOk: true, klantMailGelukt, interneGelukt };
}

// Ook los bruikbaar voor de webhook (de "PDF mislukt"-waarschuwing).
export { stuurMail, interneHtml, AFZENDER, INTERNE_MAIL };
