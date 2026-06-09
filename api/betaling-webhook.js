// /api/betaling-webhook.js
// Mollie belt dit adres server-naar-server zodra een betaling binnen is.
// Bij status 'paid':
//   1. bouwt een gebrande PDF (1 pagina, Power Profile-stijl) uit de betaal-metadata
//   2. mailt die PDF naar de KLANT (vanaf je geverifieerde domein)
//   3. stuurt jou een interne verkoopmelding (naam + FTP)
//
// Vereist in Vercel: MOLLIE_API_KEY, RESEND_API_KEY
// Vereist in package.json: "pdf-lib"
//
// Pas deze drie regels eventueel aan:
const INTERNE_MAIL = 'michel.kredercoaching@gmail.com';
const AFZENDER     = 'Michel Kreder Coaching <rapport@michelkredercoaching.nl>';
const REPLY_TO     = 'michel.kredercoaching@gmail.com';

// Witte wordmark (PNG, transparant) ingebakken als base64 — geen los bestand nodig.
const LOGO_B64 = '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';

// ---------- PDF: 1 pagina, Power Profile-stijl ----------
async function bouwRapportPdf(meta) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const c = (hex) => { const n=parseInt(hex.replace('#',''),16); return rgb(((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255); };
  const BG=c('#0d0d0d'), CARD=c('#161616'), CARD2=c('#1a120c'), BORDER=c('#2b2b2b'), BORDERO=c('#48280f');
  const WIT=c('#fafafa'), MUT=c('#9a9a9a'), DIM=c('#6a6a6a'), ORANJE=c('#fc4c02'), GROEN=c('#4caf80'), ROOD=c('#e87070');
  const TRACK=c('#262626');
  const ZONE_KLEUR=['#22c55e','#eab308','#fc4c02','#3b82f6','#8b5cf6','#6b7280'];
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

  const naam=meta.naam||'Sporter';
  const ftp=parseInt(meta.ftp)||null;
  const score=meta.score!=null&&meta.score!==''?meta.score:null;
  const uren=meta.uren!=null&&meta.uren!==''?Number(meta.uren):null;
  const vo2=meta.vo2max!=null&&meta.vo2max!==''?Number(meta.vo2max):null;
  const ritten=meta.ritten!=null&&meta.ritten!==''?Number(meta.ritten):null;
  const zones=(meta.zones||'').split('-').map(n=>parseInt(n)||0).filter((_,i)=>i<6);

  // HEADER
  if (LOGO_B64 && LOGO_B64.length>20) { try { const logo=await doc.embedPng(Buffer.from(LOGO_B64,"base64")); const lw=120,lh=lw*(73/324); page.drawImage(logo,{x:M,y:y-lh+2,width:lw,height:lh}); } catch(e){ txt('MICHEL KREDER COACHING',M,y-10,{font:bold,size:12}); } }
  else txt('MICHEL KREDER COACHING',M,y-10,{font:bold,size:12});
  const datum=new Date().toLocaleDateString('nl-NL',{day:'numeric',month:'long',year:'numeric'});
  txt('POWER PROFILE\u2122',R,y-2,{font:bold,size:8,color:DIM,align:'right'});
  txt(`Analyse \u00b7 laatste 90 dagen${ritten?` \u00b7 ${ritten} ritten`:''}`,R,y-14,{font:reg,size:8,color:DIM,align:'right'});
  txt(datum,R,y-26,{font:reg,size:8,color:DIM,align:'right'});
  y-=46;
  // TITEL + SCORE
  txt('Power Profile\u2122',M,y-26,{font:bold,size:30});
  txt('Persoonlijk vermogensprofiel voor '+naam,M,y-42,{font:reg,size:10,color:MUT});
  if (score!=null){ txt(String(score),R,y-30,{font:bold,size:46,color:ORANJE,align:'right'}); txt('TRAINING SCORE',R,y-44,{font:bold,size:7,color:DIM,align:'right'}); }
  y-=58;
  txt('INZICHT.',M,y,{font:bold,size:10,color:WIT});
  txt(' TRAIN GERICHT.',M+bold.widthOfTextAtSize('INZICHT.',10),y,{font:bold,size:10,color:ORANJE});
  txt(' WORD STERKER.',M+bold.widthOfTextAtSize('INZICHT. TRAIN GERICHT.',10),y,{font:bold,size:10,color:WIT});
  y-=16; page.drawLine({start:{x:M,y},end:{x:R,y},thickness:1,color:BORDER}); y-=18;

  // ZONE CARD
  const namen=zones.length===5?ZONE_NAAM5:ZONE_NAAM6;
  const zoneCardH=34+namen.length*21+12;
  ensure(zoneCardH);
  card(M,y-zoneCardH,R-M,zoneCardH);
  txt('ZONEDISTRIBUTIE \u00b7 WAAR TRAINDE JIJ?',M+16,y-20,{font:bold,size:9,color:WIT});
  const z=(i)=>zones[i]||0;
  const laagTot=z(0)+z(1), grijsTot=z(2)+z(3), kwalTot=z(4)+z(5), polen=laagTot+kwalTot;
  const kwalAandeel=polen>0?(kwalTot/polen)*100:0;
  const badgeVoor=(nm)=>{ if(nm==='FTP'||nm==='VO2max'||nm==='Drempel'){ if(kwalAandeel>=13&&kwalAandeel<=30)return 'goed'; return kwalAandeel<13?'laag':'hoog'; } if(nm==='Herstel'||nm==='Duur'){ if(laagTot>=75)return 'goed'; if(laagTot>=58)return 'ok'; return 'laag'; } if(nm==='Tempo'||nm==='Sweetspot')return grijsTot>12?'hoog':'ok'; return 'ok'; };
  const badgeTekst=(b)=>b==='goed'?'GOED':b==='laag'?'LAAG':b==='hoog'?'TE HOOG':'OK';
  const badgeKleur=(b)=>b==='goed'?GROEN:(b==='laag'||b==='hoog')?ORANJE:DIM;
  const grenzen=(i)=>{ if(!ftp)return ''; if(i===0)return `< ${Math.round(ftp*0.55)}W`; if(i===namen.length-1)return `> ${Math.round(ftp*1.05)}W`; const p=[[0,0.55],[0.55,0.75],[0.75,0.85],[0.85,0.95],[0.95,1.05]]; const [lo,hi]=p[i]; return `${Math.round(ftp*lo)}\u2013${Math.round(ftp*hi)}W`; };
  const maxPct=Math.max(...zones,1), barX=M+150, barW=R-barX-110;
  namen.forEach((nm,i)=>{ const cy=y-38-i*21; txt(nm,M+16,cy,{font:bold,size:9.5,color:WIT}); txt(grenzen(i),M+86,cy,{font:reg,size:7.5,color:DIM}); page.drawRectangle({x:barX,y:cy-2,width:barW,height:7,color:TRACK}); const fw=Math.max(barW*(z(i)/Math.max(maxPct,1)),z(i)>0?3:0); if(fw>0)page.drawRectangle({x:barX,y:cy-2,width:fw,height:7,color:c(ZONE_KLEUR[i]||'#6b7280')}); txt(`${z(i)}%`,barX+barW+26,cy,{font:bold,size:9,color:MUT,align:'right'}); const b=badgeVoor(nm); const bx=R-58; page.drawRectangle({x:bx,y:cy-3,width:54,height:13,color:CARD,borderColor:badgeKleur(b),borderWidth:0.8}); txt(badgeTekst(b),bx+27,cy,{font:bold,size:7,color:badgeKleur(b),align:'center'}); });
  y-=zoneCardH+14;

  // FTP CARD
  const ftpH=92; ensure(ftpH);
  card(M,y-ftpH,R-M,ftpH,{fill:CARD2,border:BORDERO});
  txt('FTP DETECTOR\u2122',M+16,y-20,{font:bold,size:9,color:ORANJE});
  txt(ftp?String(ftp):'\u2014',M+16,y-58,{font:bold,size:40,color:WIT});
  if(ftp)txt('WATT',M+16+bold.widthOfTextAtSize(String(ftp),40)+8,y-58,{font:bold,size:13,color:DIM});
  let betr='hoog',betrK=GROEN; if(ritten!=null){ if(ritten>=15){betr='hoog';betrK=GROEN;} else if(ritten>=8){betr='gemiddeld';betrK=ORANJE;} else {betr='laag';betrK=ROOD;} }
  txt(`Berekend uit ${ritten!=null?ritten:'\u2014'} ritten`,M+16,y-76,{font:reg,size:8.5,color:MUT});
  txt('Betrouwbaarheid: ',R-16-bold.widthOfTextAtSize(betr,8.5),y-20,{font:reg,size:8.5,color:MUT,align:'right'});
  txt(betr,R-16,y-20,{font:bold,size:8.5,color:betrK,align:'right'});
  const pillW=128; page.drawRectangle({x:R-16-pillW,y:y-72,width:pillW,height:20,color:ORANJE});
  txt('GEEN FTP-TEST NODIG',R-16-pillW/2,y-66,{font:bold,size:8,color:WIT,align:'center'});
  y-=ftpH+14;

  // KRITIEKE BEVINDING
  if (vo2!=null && Number(vo2)===0) {
    const lines=wrapTxt('In 90 dagen deed je 0 VO2max-sessies. Dit is meestal de hoofdoorzaak van een prestatieplateau \u2014 je motor krijgt geen groeiprikkel.',reg,9.5,R-M-32);
    const kh=24+lines.length*13+10; ensure(kh);
    card(M,y-kh,R-M,kh,{fill:c('#1c1010'),border:c('#5a2424')});
    txt('KRITIEKE BEVINDING',M+16,y-18,{font:bold,size:8,color:ROOD});
    lines.forEach((ln,idx)=>txt(ln,M+16,y-32-idx*13,{font:reg,size:9.5,color:c('#d8b0b0')}));
    y-=kh+14;
  }

  // ACTIEPLAN
  const w110=ftp?Math.round(ftp*1.1):null;
  const acties=[
    'Train minimaal 3x per week \u2014 consistent, elke week, geen uitzonderingen.',
    ftp?`Voeg 1x per week een VO2max-blok toe: 4\u00d74 min boven ${w110}W met 3 min herstel.`:'Voeg 1x per week een VO2max-blok toe: 4\u00d74 min hard met 3 min herstel.',
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

  // ===== INTERVALBLOKKEN (zelfde logica als de webversie) =====
  const meerVolume = (uren||0) >= 8;
  const wB=(lo,hi)=> ftp ? `${Math.round(ftp*lo)}\u2013${Math.round(ftp*hi)}W` : `${Math.round(lo*100)}\u2013${Math.round(hi*100)}% FTP`;
  const blokken=[];
  if (meerVolume){
    blokken.push({type:'DUURKRACHT \u2014 DREMPELBLOK \u00b7 1X PER WEEK', oms:`5x8 min op ${wB(0.70,0.75)} \u00b7 4 min rust tussen sets`, det:'Bouwt je aerobe motor en drempel zonder je leeg te trekken. Comfortabel zwaar \u2014 je kunt nog korte zinnen praten. \u00c9\u00e9n keer per week is genoeg.'});
    blokken.push({type:'VO2MAX \u2014 OPTIE A \u00b7 LANGE MICRO-INTERVALLEN', oms:`40-20 op ${wB(1.30,1.40)} \u00b7 2\u20133 blokken van 8\u201312 min, 5 min rust`, det:'40 sec vol, 20 sec rustig d\u00f3\u00f3rdraaien. Je hartslag blijft hoog over het hele blok \u2014 maximale prikkel voor je zuurstofopname. 1x per week.'});
    blokken.push({type:'VO2MAX \u2014 OPTIE B \u00b7 LANGERE REPS', oms:`80-40 op ${wB(1.10,1.20)} \u00b7 2\u20133 blokken van 8\u201312 min, 5 min rust`, det:'Langere inspanningen op een lager percentage. Goed alternatief als de 40-20 te zwaar voelt, of voor variatie. Kies \u00e9\u00e9n optie per week.'});
  } else {
    blokken.push({type:'DUURKRACHT \u2014 DREMPELBLOK \u00b7 1X PER WEEK', oms:`5x5 min op ${wB(0.70,0.75)} \u00b7 3 min rust tussen sets`, det:'De effici\u00ebnte manier om je aerobe basis te bouwen als je weinig tijd hebt. Comfortabel zwaar, niet vol. \u00c9\u00e9n keer per week \u2014 vaker is niet nodig.'});
    blokken.push({type:'VO2MAX \u2014 OPTIE A \u00b7 KORTE MICRO-INTERVALLEN', oms:`20-10 op ${wB(1.10,1.30)} \u00b7 2\u20133 blokken van 8\u201312 min, 5 min rust`, det:'20 sec aan, 10 sec uit. Toegankelijk maar effectief \u2014 je houdt het vol terwijl de prikkel hoog blijft. Ideaal als je minder fietst. 1x per week.'});
    blokken.push({type:'VO2MAX \u2014 OPTIE B \u00b7 PITTIGER', oms:`30-30 op ${wB(1.20,1.50)} \u00b7 2\u20133 blokken van 8\u201312 min, 5 min rust`, det:'30 sec stevig, 30 sec rustig. Iets meer bite dan de 20-10. Kies \u00e9\u00e9n van beide opties per week voor afwisseling.'});
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

  // CTA
  const ctaH=58; ensure(ctaH+24);
  card(M,y-ctaH,R-M,ctaH,{fill:CARD2,border:BORDERO});
  txt('KLAAR VOOR ECHTE PROGRESSIE?',M+16,y-18,{font:bold,size:9,color:ORANJE});
  txt('Een persoonlijk trainingsschema vertaalt dit rapport naar week-voor-week training \u2014 vanaf \u20ac59.',M+16,y-34,{font:reg,size:9,color:MUT});
  txt('michelkredercoaching.nl/trainingsschemas',M+16,y-49,{font:bold,size:9,color:WIT});

  // footer op de laatste pagina
  txt('Power Profile\u2122 \u00b7 Michel Kreder Coaching \u00b7 momentopname op basis van je Strava-data.',M,26,{font:reg,size:7,color:DIM});

  return await doc.save();
}

function klantHtml(naam) {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;line-height:1.65;max-width:560px;">
    <p style="font-size:16px;margin:0 0 14px;">Hi ${naam},</p>
    <p style="font-size:15px;margin:0 0 14px;">Bedankt voor je aankoop. Je <strong>Power Profile\u2122 trainingsrapport</strong> zit als PDF in de bijlage van deze mail.</p>
    <p style="font-size:15px;margin:0 0 14px;">Daarin vind je je gedetecteerde FTP, je zoneverdeling van de laatste 90 dagen, je trainingsscore, je actieplan en wat de cijfers betekenen voor jouw progressie.</p>
    <div style="margin:22px 0;padding:18px;background:#fff4ef;border:1px solid #f3d9cc;border-radius:8px;">
      <p style="font-size:13px;font-weight:700;color:#fc4c02;letter-spacing:.5px;margin:0 0 6px;">KLAAR VOOR ECHTE PROGRESSIE?</p>
      <p style="font-size:14px;margin:0 0 10px;color:#333;">Een persoonlijk trainingsschema vertaalt dit rapport naar week-voor-week training op maat \u2014 vanaf \u20ac59.</p>
      <a href="https://michelkredercoaching.nl/trainingsschemas" style="display:inline-block;background:#fc4c02;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 20px;border-radius:6px;">Bekijk de trainingsschema's \u2192</a>
    </div>
    <p style="font-size:14px;margin:0 0 4px;">Vragen? Reageer gewoon op deze mail.</p>
    <p style="font-size:14px;margin:18px 0 0;color:#666;">Sterke kilometers,<br><strong style="color:#1a1a1a;">Michel Kreder Coaching</strong></p>
  </div>`;
}

function interneHtml(m, bedrag, id) {
  const r=(label,val)=>`<tr><td style="padding:4px 16px 4px 0;color:#666;">${label}</td><td style="padding:4px 0;font-weight:700;">${val}</td></tr>`;
  return `
  <div style="font-family:Arial,sans-serif;color:#111;line-height:1.6;">
    <h2 style="margin:0 0 4px;">\ud83d\udeb4 Nieuwe verkoop</h2>
    <p style="margin:0 0 16px;color:#666;">Power Profile\u2122 \u00b7 ${bedrag} betaald</p>
    <table style="border-collapse:collapse;font-size:15px;">
      ${r('Naam', m.naam||'Sporter')}
      ${r('E-mail', m.email||'\u2014')}
      ${r('FTP', (m.ftp||'?')+' W')}
      ${r('Uren/week', m.uren!=null?m.uren:'?')}
      ${r('Trainingsscore', m.score!=null?m.score:'?')}
      ${r('VO2max-sessies', m.vo2max!=null?m.vo2max:'?')}
      ${r('Herstelbalans', m.herstel!=null?m.herstel+'/10':'\u2014')}
      ${r('Zones', m.zones||'\u2014')}
    </table>
    <p style="margin:16px 0 0;color:#999;font-size:12px;">Mollie betaling-id: ${id}</p>
  </div>`;
}

async function stuurMail(payload) {
  const r = await fetch('https://api.resend.com/emails', {
    method:'POST',
    headers:{ Authorization:`Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type':'application/json' },
    body: JSON.stringify(payload)
  });
  if (!r.ok) console.error('Resend fout:', r.status, await r.text());
  return r.ok;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(200).send('ok');
    const id = (req.body && req.body.id) || (req.query && req.query.id);
    if (!id) return res.status(200).send('geen id');

    const mr = await fetch(`https://api.mollie.com/v2/payments/${id}`, { headers:{ Authorization:`Bearer ${process.env.MOLLIE_API_KEY}` } });
    const betaling = await mr.json();
    if (betaling.status !== 'paid') return res.status(200).send('niet betaald');

    const m = betaling.metadata || {};
    const naam = m.naam || 'Sporter';
    const bedrag = betaling.amount ? `\u20ac${betaling.amount.value}` : '\u20ac19,00';

    let pdfB64 = null;
    try { const bytes = await bouwRapportPdf(m); pdfB64 = Buffer.from(bytes).toString('base64'); }
    catch (e) { console.error('PDF genereren faalde:', e); }

    if (m.email) {
      try {
        await stuurMail({
          from: AFZENDER, to: m.email, reply_to: REPLY_TO,
          subject: 'Je Power Profile\u2122 trainingsrapport \ud83d\udeb4',
          html: klantHtml(naam),
          attachments: pdfB64 ? [{ filename: 'Power-Profile-trainingsrapport.pdf', content: pdfB64 }] : undefined
        });
      } catch (e) { console.error('Klantmail faalde:', e); }
    }

    try {
      await stuurMail({ from: AFZENDER, to: INTERNE_MAIL, subject: `\ud83d\udeb4 Nieuwe verkoop \u2014 ${naam} \u00b7 FTP ${m.ftp||'?'}W`, html: interneHtml(m, bedrag, id) });
    } catch (e) { console.error('Interne mail faalde:', e); }

    return res.status(200).send('ok');
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(200).send('ok');
  }
}
