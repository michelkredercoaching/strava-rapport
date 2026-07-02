// /api/betaling-webhook.js
// Mollie belt dit adres server-naar-server zodra een betaling binnen is.
// Bij status 'paid':
//   1. bouwt een gebrande PDF (Power Profile-stijl) uit de betaal-metadata
//   2. mailt die PDF naar de KLANT (vanaf je geverifieerde domein)
//   3. stuurt JOU een interne verkoopmelding MÃ‰T de PDF als bijlage
//   4. maakt unieke 72u-coupons aan en zet de koper in Mailchimp (nurture)
//
// Vereist in Vercel: MOLLIE_API_KEY, RESEND_API_KEY
// Voor de nurture:   WC_URL, WC_CONSUMER_KEY, WC_CONSUMER_SECRET,
//                    WC_PRODUCT_8/12/16, MAILCHIMP_API_KEY, MAILCHIMP_LIST_ID
// Optioneel in Vercel: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
// Vereist in package.json: "pdf-lib"
import crypto from 'node:crypto';

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

// ===== REDIS (Upstash REST) â€” ontdubbeling & lock =====
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const redisAan    = !!(REDIS_URL && REDIS_TOKEN);

async function redis(cmd) {
  if (!redisAan) return { ok: false };
  try {
    const r = await fetch(REDIS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
      signal: AbortSignal.timeout(5000)
    });
    if (!r.ok) { console.error('Redis fout:', r.status); return { ok: false }; }
    const j = await r.json();
    return { ok: true, result: j.result };
  } catch (e) { console.error('Redis exception:', e); return { ok: false }; }
}

async function alVerstuurd(id) {
  const r = await redis(['GET', `pp:done:${id}`]);
  return r.ok && r.result === '1';
}
async function markeerVerstuurd(id) {
  await redis(['SET', `pp:done:${id}`, '1', 'EX', '2592000']); // 30 dagen
}
async function pakLock(id) {
  const r = await redis(['SET', `pp:lock:${id}`, '1', 'NX', 'EX', '120']);
  if (!r.ok) return 'vrij';
  return r.result === 'OK' ? 'vrij' : 'bezig';
}
async function geefLockVrij(id) { await redis(['DEL', `pp:lock:${id}`]); }
async function magWaarschuwen(id) {
  const r = await redis(['SET', `pp:warned:${id}`, '1', 'NX', 'EX', '3600']);
  if (!r.ok) return true;
  return r.result === 'OK';
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
  txt('POWER PROFILEâ„¢',R,y-2,{font:bold,size:8,color:DIM,align:'right'});
  txt(`Analyse Â· laatste 90 dagen${ritten?` Â· ${ritten} ritten`:''}`,R,y-14,{font:reg,size:8,color:DIM,align:'right'});
  txt(datum,R,y-26,{font:reg,size:8,color:DIM,align:'right'});
  y-=46;
  txt('Power Profileâ„¢',M,y-26,{font:bold,size:30});
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
  txt('ZONEDISTRIBUTIE Â· WAAR TRAINDE JIJ?',M+16,y-20,{font:bold,size:9,color:WIT});
  const z=(i)=>zones[i]||0;
  const laagTot=z(0)+z(1), grijsTot=z(2)+z(3), kwalTot=z(4)+z(5), polen=laagTot+kwalTot;
  const kwalAandeel=polen>0?(kwalTot/polen)*100:0;
  const badgeVoor=(nm)=>{ if(nm==='FTP'||nm==='VO2max'||nm==='Drempel'){ if(kwalAandeel>=13&&kwalAandeel<=30)return 'goed'; return kwalAandeel<13?'laag':'hoog'; } if(nm==='Herstel'||nm==='Duur'){ if(laagTot>=75)return 'goed'; if(laagTot>=58)return 'ok'; return 'laag'; } if(nm==='Tempo'||nm==='Sweetspot')return grijsTot>12?'hoog':'ok'; return 'ok'; };
  const badgeTekst=(b)=>b==='goed'?'GOED':b==='laag'?'LAAG':b==='hoog'?'TE HOOG':'OK';
  const badgeKleur=(b)=>b==='goed'?GROEN:(b==='laag'||b==='hoog')?ORANJE:DIM;
  const grenzen=(i)=>{ if(!ftp)return ''; if(i===0)return `< ${Math.round(ftp*0.55)}W`; if(i===namen.length-1)return `> ${Math.round(ftp*1.05)}W`; const p=[[0,0.55],[0.55,0.75],[0.75,0.85],[0.85,0.95],[0.95,1.05]]; const [lo,hi]=p[i]; return `${Math.round(ftp*lo)}â€“${Math.round(ftp*hi)}W`; };
  const maxPct=Math.max(...zones,1), barX=M+150, barW=R-barX-110;
  namen.forEach((nm,i)=>{ const cy=y-38-i*21; txt(nm,M+16,cy,{font:bold,size:9.5,color:WIT}); txt(grenzen(i),M+86,cy,{font:reg,size:7.5,color:DIM}); page.drawRectangle({x:barX,y:cy-2,width:barW,height:7,color:TRACK}); const fw=Math.max(barW*(z(i)/Math.max(maxPct,1)),z(i)>0?3:0); if(fw>0)page.drawRectangle({x:barX,y:cy-2,width:fw,height:7,color:c(ZONE_KLEUR[i]||'#6b7280')}); txt(`${z(i)}%`,barX+barW+26,cy,{font:bold,size:9,color:MUT,align:'right'}); const b=badgeVoor(nm); const bx=R-58; page.drawRectangle({x:bx,y:cy-3,width:54,height:13,color:CARD,borderColor:badgeKleur(b),borderWidth:0.8}); txt(badgeTekst(b),bx+27,cy,{font:bold,size:7,color:badgeKleur(b),align:'center'}); });
  y-=zoneCardH+14;

  const ftpH=92; ensure(ftpH);
  card(M,y-ftpH,R-M,ftpH,{fill:CARD2,border:BORDERO});
  txt('FTP DETECTORâ„¢',M+16,y-20,{font:bold,size:9,color:ORANJE});
  txt(ftp?String(ftp):'â€”',M+16,y-58,{font:bold,size:40,color:WIT});
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
  txt(`Berekend uit ${ritten!=null?ritten:'â€”'} ritten`,M+16,y-76,{font:reg,size:8.5,color:MUT});
  txt('Betrouwbaarheid: ',R-16-bold.widthOfTextAtSize(betr,8.5),y-20,{font:reg,size:8.5,color:MUT,align:'right'});
  txt(betr,R-16,y-20,{font:bold,size:8.5,color:betrK,align:'right'});
  const pillW=128; page.drawRectangle({x:R-16-pillW,y:y-72,width:pillW,height:20,color:ORANJE});
  txt('GEEN FTP-TEST NODIG',R-16-pillW/2,y-66,{font:bold,size:8,color:WIT,align:'center'});
  y-=ftpH+14;

  // ===== W/KG CARD â€” Watt per kilo + Tour-vergelijking =====
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
      volgLines = wrapTxt('Je zit in de hoogste categorie â€” WorldTour-niveau. Chapeau.', reg, 8.5, R-M-32);
    }
    const piek1 = parseInt(meta.piek1min)||null, piek5 = parseInt(meta.piek5min)||null, piek20 = parseInt(meta.piek20min)||null;
    const curve = [['1 min',piek1],['5 min',piek5],['20 min',piek20]].filter(pp => pp[1] && pp[1] > 0);
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
      const range = t[2] >= 99 ? `${t[1].toFixed(1)}+` : `${t[1].toFixed(1)}â€“${t[2].toFixed(1)}`;
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
    const lines=wrapTxt('In 90 dagen deed je 0 VO2max-sessies. Dit is meestal de hoofdoorzaak van een prestatieplateau â€” je motor krijgt geen groeiprikkel.',reg,9.5,R-M-32);
    const kh=24+lines.length*13+10; ensure(kh);
    card(M,y-kh,R-M,kh,{fill:c('#1c1010'),border:c('#5a2424')});
    txt('KRITIEKE BEVINDING',M+16,y-18,{font:bold,size:8,color:ROOD});
    lines.forEach((ln,idx)=>txt(ln,M+16,y-32-idx*13,{font:reg,size:9.5,color:c('#d8b0b0')}));
    y-=kh+14;
  }

  const w110=ftp?Math.round(ftp*1.1):null;
  const acties=[
    'Train minimaal 3x per week â€” consistent, elke week, geen uitzonderingen.',
    ftp?`Voeg 1x per week een VO2max-blok toe: 4Ã—4 min boven ${w110}W met 3 min herstel.`:'Voeg 1x per week een VO2max-blok toe: 4Ã—4 min hard met 3 min herstel.',
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
  const wB=(lo,hi)=> ftp ? `${Math.round(ftp*lo)}â€“${Math.round(ftp*hi)}W` : `${Math.round(lo*100)}â€“${Math.round(hi*100)}% FTP`;
  const blokken=[];
  if (meerVolume){
    blokken.push({type:'DUURKRACHT â€” DREMPELBLOK Â· 1X PER WEEK', oms:`5x8 min op ${wB(0.70,0.75)} Â· 4 min rust tussen sets`, det:'Bouwt je aerobe motor en drempel zonder je leeg te trekken. Comfortabel zwaar â€” je kunt nog korte zinnen praten. Ã‰Ã©n keer per week is genoeg.'});
    blokken.push({type:'VO2MAX â€” OPTIE A Â· LANGE MICRO-INTERVALLEN', oms:`40-20 op ${wB(1.30,1.40)} Â· 2â€“3 blokken van 8â€“12 min, 5 min rust`, det:'40 sec vol, 20 sec rustig dÃ³Ã³rdraaien. Je hartslag blijft hoog over het hele blok â€” maximale prikkel voor je zuurstofopname. 1x per week.'});
    blokken.push({type:'VO2MAX â€” OPTIE B Â· LANGERE REPS', oms:`80-40 op ${wB(1.10,1.20)} Â· 2â€“3 blokken van 8â€“12 min, 5 min rust`, det:'Langere inspanningen op een lager percentage. Goed alternatief als de 40-20 te zwaar voelt, of voor variatie. Kies Ã©Ã©n optie per week.'});
  } else {
    blokken.push({type:'DUURKRACHT â€” DREMPELBLOK Â· 1X PER WEEK', oms:`5x5 min op ${wB(0.70,0.75)} Â· 3 min rust tussen sets`, det:'De efficiÃ«nte manier om je aerobe basis te bouwen als je weinig tijd hebt. Comfortabel zwaar, niet vol. Ã‰Ã©n keer per week â€” vaker is niet nodig.'});
    blokken.push({type:'VO2MAX â€” OPTIE A Â· KORTE MICRO-INTERVALLEN', oms:`20-10 op ${wB(1.10,1.30)} Â· 2â€“3 blokken van 8â€“12 min, 5 min rust`, det:'20 sec aan, 10 sec uit. Toegankelijk maar effectief â€” je houdt het vol terwijl de prikkel hoog blijft. Ideaal als je minder fietst. 1x per week.'});
    blokken.push({type:'VO2MAX â€” OPTIE B Â· PITTIGER', oms:`30-30 op ${wB(1.20,1.50)} Â· 2â€“3 blokken van 8â€“12 min, 5 min rust`, det:'30 sec stevig, 30 sec rustig. Iets meer bite dan de 20-10. Kies Ã©Ã©n van beide opties per week voor afwisseling.'});
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
  txt('Een persoonlijk trainingsschema vertaalt dit rapport naar week-voor-week training â€” vanaf â‚¬59.',M+16,y-34,{font:reg,size:9,color:MUT});
  txt('michelkredercoaching.nl/trainingsschemas',M+16,y-49,{font:bold,size:9,color:WIT});

  txt('Power Profileâ„¢ Â· Michel Kreder Coaching Â· momentopname op basis van je Strava-data.',M,26,{font:reg,size:7,color:DIM});

  return await doc.save();
}

function kapitaal(s){ s=String(s||'').trim(); return s ? s.charAt(0).toUpperCase()+s.slice(1) : 'Sporter'; }

function klantHtml(naam) {
  const veiligeNaam = escHtml(naam);
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;line-height:1.65;max-width:560px;">
    <p style="font-size:16px;margin:0 0 14px;">Hi ${veiligeNaam},</p>
    <p style="font-size:15px;margin:0 0 14px;">Je rapport zit als PDF bij deze mail. Maar voordat je 'm opent â€” Ã©Ã©n instructie.</p>
    <p style="font-size:15px;margin:0 0 14px;">Kijk eerst naar Ã©Ã©n getal: <strong>je percentage in het grijze gebied</strong> (Tempo/Sweetspot).</p>
    <p style="font-size:15px;margin:0 0 18px;">Dat ene getal verklaart bij de meeste renners waarom ze hard trainen zonder sneller te worden. Te zwaar om van te herstellen. Te licht om van te groeien.</p>
    <p style="font-size:15px;margin:0 0 8px;">Daarna, in deze volgorde:</p>
    <table cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
      <tr><td style="font-size:15px;padding:3px 10px 3px 0;font-weight:700;color:#ff6b1a;vertical-align:top;">1.</td><td style="font-size:15px;padding:3px 0;"><strong>Je FTP</strong> â€” dit is vanaf nu de referentie voor elke training die je doet</td></tr>
      <tr><td style="font-size:15px;padding:3px 10px 3px 0;font-weight:700;color:#ff6b1a;vertical-align:top;">2.</td><td style="font-size:15px;padding:3px 0;"><strong>Je actieplan</strong> â€” 3 stappen. Begin deze week met stap 1.</td></tr>
      <tr><td style="font-size:15px;padding:3px 10px 3px 0;font-weight:700;color:#ff6b1a;vertical-align:top;">3.</td><td style="font-size:15px;padding:3px 0;"><strong>De intervalblokken</strong> â€” kies er Ã©Ã©n en zet 'm nÃº in je agenda</td></tr>
    </table>
    <p style="font-size:15px;margin:0 0 14px;">Want hier gaat het mis bij 90% van de mensen die een analyse kopen: ze lezen 'm, denken â€œinteressantâ€, en trainen maandag exact hetzelfde als vorige week.</p>
    <p style="font-size:15px;margin:0 0 18px;"><strong>Een rapport dat je leest verandert niets. Een rapport dat je uitvoert wel.</strong> De renners die over 6 weken verschil voelen, zijn de renners die vandaag hun eerste training inplannen.</p>
    <div style="margin:22px 0;padding:18px;background:#fff4ef;border:1px solid #f5d8c5;border-radius:8px;">
      <p style="font-size:13px;font-weight:700;color:#ff6b1a;letter-spacing:.5px;margin:0 0 6px;">VAN INZICHT NAAR UITVOERING</p>
      <p style="font-size:14px;margin:0 0 10px;color:#333;">Dit rapport vertelt je wÃ¡t er mis gaat. Een persoonlijk trainingsschema regelt hÃ³e je het oplost â€” elke week exact weten wat je rijdt, in welke zone, en wanneer je herstelt. Gebouwd op jouw FTP en jouw uren. Vanaf â‚¬59.</p>
      <a href="https://michelkredercoaching.nl/trainingsschemas" style="display:inline-block;background:#ff6b1a;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 20px;border-radius:6px;">Bekijk de trainingsschema's â†’</a>
    </div>
    <p style="font-size:14px;margin:0 0 4px;">Vragen over je cijfers? Reageer gewoon op deze mail â€” ik lees alles zelf.</p>
    <p style="font-size:14px;margin:18px 0 0;color:#666;">Sterke kilometers,<br><strong style="color:#1a1a1a;">Michel</strong><br>Michel Kreder Coaching</p>
    <p style="font-size:13px;margin:20px 0 0;color:#888;border-top:1px solid #eee;padding-top:14px;">P.S. Denk je dat je FTP niet klopt? Op je rapportpagina staat â€œKlopt dit niet? Pas je FTP aanâ€ â€” vul je echte waarde in en je zones en intervallen herrekenen direct.</p>
  </div>`;
}

function interneHtml(m, bedrag, id, pdfErbij) {
  const r=(label,val)=>`<tr><td style="padding:4px 16px 4px 0;color:#666;">${label}</td><td style="padding:4px 0;font-weight:700;">${val}</td></tr>`;
  const statusBalk = pdfErbij
    ? `<p style="margin:16px 0 0;padding:10px 14px;border-radius:6px;background:#eef7f0;color:#2e7d4f;font-size:14px;font-weight:600;">ðŸ“Ž PDF zit als bijlage bij deze mail â€” klaar om te forwarden naar de klant.</p>`
    : `<p style="margin:16px 0 0;padding:10px 14px;border-radius:6px;background:#fdecea;color:#c0392b;font-size:14px;font-weight:600;">âš  PDF kon NIET worden gegenereerd. De klant heeft (nog) niets ontvangen â€” check handmatig.</p>`;
  return `
  <div style="font-family:Arial,sans-serif;color:#111;line-height:1.6;">
    <h2 style="margin:0 0 4px;">ðŸš´ Nieuwe verkoop</h2>
    <p style="margin:0 0 16px;color:#666;">Power Profileâ„¢ Â· ${escHtml(bedrag)} betaald</p>
    <table style="border-collapse:collapse;font-size:15px;">
      ${r('Naam', escHtml(m.naam||'Sporter'))}
      ${r('E-mail', escHtml(m.email||'â€”'))}
      ${r('FTP', escHtml((m.ftp||'?'))+' W')}
      ${r('FTP-betrouwbaarheid', escHtml(m.ftpBetrouwbaarheid||'â€”'))}
      ${r('Uren/week', m.uren!=null?escHtml(m.uren):'?')}
      ${r('Trainingsscore', m.score!=null?escHtml(m.score):'?')}
      ${r('VO2max-sessies', m.vo2max!=null?escHtml(m.vo2max):'?')}
      ${r('Herstelbalans', m.herstel!=null?escHtml(m.herstel)+'/10':'â€”')}
      ${r('Zones', escHtml(m.zones||'â€”'))}
    </table>
    ${statusBalk}
    <p style="margin:16px 0 0;color:#999;font-size:12px;">Mollie betaling-id: ${escHtml(id)}</p>
  </div>`;
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

// ===== NURTURE: coupons (WooCommerce) + koper naar Mailchimp =====
const WC_URL    = process.env.WC_URL;
const WC_KEY    = process.env.WC_CONSUMER_KEY;
const WC_SECRET = process.env.WC_CONSUMER_SECRET;
const MC_KEY    = process.env.MAILCHIMP_API_KEY;      // ...-usXX
const MC_LIST   = process.env.MAILCHIMP_LIST_ID;
const MC_DC     = MC_KEY ? MC_KEY.split('-')[1] : null;

// De staffel: product-ID + tegoed per duur.
const SCHEMAS = [
  { wk: '8',  productId: process.env.WC_PRODUCT_8,  tegoed: '10.00' },
  { wk: '12', productId: process.env.WC_PRODUCT_12, tegoed: '20.00' },
  { wk: '16', productId: process.env.WC_PRODUCT_16, tegoed: '29.00' },
];

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

// Unieke coupons (1x te gebruiken, 4 dagen geldig) via de WooCommerce REST API.
async function maakCoupons(m, id) {
  const leeg = { codes: {}, deadlineNL: '' };
  if (!WC_URL || !WC_KEY || !WC_SECRET || !m.email) { console.log('Coupons overslaan (WC-config/email mist)'); return leeg; }
  const auth = 'Basic ' + Buffer.from(`${WC_KEY}:${WC_SECRET}`).toString('base64');
  const expISO = new Date(Date.now() + 4*24*3600*1000).toISOString();
  const suffix = crypto.createHash('md5').update(String(m.email).toLowerCase() + ':' + String(id)).digest('hex').slice(0, 6).toUpperCase();
  const codes = {};
  for (const s of SCHEMAS) {
    if (!s.productId) continue;
    const code = `PP${s.wk}-${suffix}`;
    try {
      const r = await fetch(`${WC_URL}/wp-json/wc/v3/coupons`, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          discount_type: 'fixed_product',
          amount: s.tegoed,
          product_ids: [Number(s.productId)],
          date_expires: expISO,
          usage_limit: 1,
          individual_use: true,
          description: `Power Profile analyse-tegoed ${s.wk} weken`
        }),
        signal: AbortSignal.timeout(12000)
      });
      const txt = r.ok ? '' : await r.text();
      if (r.ok || /exist/i.test(txt)) codes[s.wk] = code;   // bestaat al (retry) = ook goed
      else console.error('WC coupon fout', code, r.status, txt.slice(0, 200));
    } catch (e) { console.error('WC coupon exception', code, e); }
  }
  const deadlineNL = new Date(Date.now() + 72*3600*1000)
    .toLocaleString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  return { codes, deadlineNL };
}

// Koper + pijnpunt + coupons naar Mailchimp (Keuzehulp-audience).
async function naarMailchimp(m, couponInfo) {
  if (!MC_KEY || !MC_LIST || !MC_DC || !m.email) { console.log('Mailchimp overslaan (config/email mist)'); return; }
  const { pijn, pct } = bepaalPijn(m);
  const hash = crypto.createHash('md5').update(String(m.email).toLowerCase()).digest('hex');
  const base = `https://${MC_DC}.api.mailchimp.com/3.0/lists/${MC_LIST}`;
  const auth = 'Basic ' + Buffer.from('any:' + MC_KEY).toString('base64');
  const c = couponInfo.codes || {};
  try {
    await fetch(`${base}/members/${hash}`, {
      method: 'PUT',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email_address: m.email,
        status_if_new: 'subscribed',
        merge_fields: {
          FNAME: m.naam || '', FTP: m.ftp || '', SCORE: m.score || '',
          PIJN: pijn, PIJNPCT: String(pct),
          COUPON8: c['8'] || '', COUPON12: c['12'] || '', COUPON16: c['16'] || '',
          DEADLINE: couponInfo.deadlineNL || ''
        }
      }),
      signal: AbortSignal.timeout(10000)
    });
    await fetch(`${base}/members/${hash}/tags`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: [{ name: 'power-profile-koper', status: 'active' }, { name: 'pijn-' + pijn, status: 'active' }] }),
      signal: AbortSignal.timeout(10000)
    });
    console.log('Mailchimp OK:', m.email, '| pijn:', pijn, '| coupons:', Object.keys(c).join(','));
  } catch (e) { console.error('Mailchimp faalde (blokkeert niet):', e); }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('ok');
  const id = (req.body && req.body.id) || (req.query && req.query.id);
  if (!id) return res.status(200).send('geen id');

  // 1) Verifieer de betaling bij Mollie (we vertrouwen de webhook-body niet).
  let betaling;
  try {
    const mr = await fetch(`https://api.mollie.com/v2/payments/${encodeURIComponent(id)}`, {
      headers:{ Authorization:`Bearer ${process.env.MOLLIE_API_KEY}` },
      signal: AbortSignal.timeout(15000)
    });
    betaling = await mr.json();
  } catch (err) {
    console.error('Mollie ophalen faalde:', err);
    return res.status(503).send('mollie onbereikbaar'); // â†’ Mollie probeert later opnieuw
  }

  console.log('Webhook:', id, '| status:', betaling.status, '| email:', (betaling.metadata && betaling.metadata.email) || 'GEEN');
  if (betaling.status !== 'paid') return res.status(200).send('niet betaald');

  // 2) ONTDUBBELING â€” al eerder volledig verstuurd? Dan niets meer doen.
  if (await alVerstuurd(id)) {
    console.log('Webhook: al verstuurd, skip', id);
    return res.status(200).send('al verstuurd');
  }

  // 3) LOCK â€” voorkom dat twee gelijktijdige webhooks dezelfde betaling verwerken.
  if (await pakLock(id) === 'bezig') {
    console.log('Webhook: andere invocatie is bezig, later opnieuw', id);
    return res.status(503).send('bezig - retry');
  }

  try {
    const m = betaling.metadata || {};
    const naam = kapitaal(m.naam);
    const bedrag = betaling.amount && betaling.amount.value ? `â‚¬${betaling.amount.value}` : 'â€”';
    const veiligeBestandsnaam = String(naam).replace(/[^a-z0-9]/gi,'_').slice(0,40) || 'sporter';

    // 4) PDF bouwen â€” de kern van het rapport.
    let pdfB64 = null;
    try {
      const bytes = await bouwRapportPdf(m);
      pdfB64 = Buffer.from(bytes).toString('base64');
      console.log('PDF gebouwd:', bytes.length, 'bytes');
    } catch (e) { console.error('PDF genereren faalde:', e); }

    // Geval A: PDF mislukt â†’ klant GEEN lege mail, Michel waarschuwen (max 1x/uur), retry.
    if (!pdfB64) {
      if (await magWaarschuwen(id)) {
        await stuurMail({
          from: AFZENDER, to: INTERNE_MAIL,
          subject: `âš  PDF MISLUKT â€” ${naam} Â· betaald maar geen rapport`,
          html: interneHtml(m, bedrag, id, false)
        });
      }
      return res.status(503).send('pdf mislukt - retry');
    }

    // Geval B: PDF OK.
    // 5a) Klantmail met de PDF.
    let klantMailGelukt = false;
    if (m.email) {
      klantMailGelukt = await stuurMail({
        from: AFZENDER, to: m.email, reply_to: REPLY_TO,
        subject: 'Je rapport zit erbij â€” maar kijk eÃ©rst naar dit ene getal ðŸš´',
        html: klantHtml(naam),
        attachments: [{ filename: 'Power-Profile-trainingsrapport.pdf', content: pdfB64 }]
      });
    }

    // 5b) Interne mail MÃ‰T de PDF als bijlage â€” jouw kopie, met Ã©Ã©n herkansing.
    const internePayload = {
      from: AFZENDER, to: INTERNE_MAIL,
      subject: `ðŸš´ Nieuwe verkoop â€” ${naam} Â· FTP ${m.ftp||'?'}W`,
      html: interneHtml(m, bedrag, id, true),
      attachments: [{ filename: `Power-Profile-${veiligeBestandsnaam}.pdf`, content: pdfB64 }]
    };
    let interneGelukt = await stuurMail(internePayload);
    if (!interneGelukt) interneGelukt = await stuurMail(internePayload);

    // 6) Klant-adres aanwezig Ã©n mail mislukt â†’ 503 zodat Mollie retryt (nog NIET
    //    als verstuurd gemarkeerd, dus de klant krijgt nooit een dubbele mail).
    if (m.email && !klantMailGelukt) {
      return res.status(503).send('klantmail mislukt - retry');
    }

    // 6b) NURTURE â€” unieke 72u-coupons + koper naar Mailchimp. Faalt dit, dan
    //     gaan de verkoop en PDF gewoon door; we loggen het alleen.
    try {
      const couponInfo = await maakCoupons(m, id);
      await naarMailchimp(m, couponInfo);
    } catch (e) { console.error('Nurture-stap faalde (blokkeert niet):', e); }

    // 7) Succes â†’ vastleggen zodat een latere retry niks dubbel doet.
    await markeerVerstuurd(id);
    return res.status(200).send('ok');

  } finally {
    await geefLockVrij(id);
  }
}
