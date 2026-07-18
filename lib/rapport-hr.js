// /lib/rapport-hr.js
// Bouwt het HARTSLAG-rapport (PDF) voor renners zonder (voldoende) vermogensdata.
// Spiegel van de vermogens-PDF in betaling-webhook.js, maar dan op omslagpunt
// (drempelhartslag) i.p.v. FTP: bpm-zones, RPE-gestuurde intervallen, geen W/kg.
// De webhook kiest op basis van meta.meetmethode welke van de twee hij bouwt.

export async function bouwRapportPdfHr(meta) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const c = (hex) => { const n=parseInt(hex.replace('#',''),16); return rgb(((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255); };
  const BG=c('#0d0d0d'), CARD=c('#161616'), CARD2=c('#1a120c'), BORDER=c('#2b2b2b'), BORDERO=c('#48280f');
  const WIT=c('#fafafa'), MUT=c('#9a9a9a'), DIM=c('#6a6a6a'), ORANJE=c('#ff6b1a'), GROEN=c('#4caf80'), ROOD=c('#e87070');
  const TRACK=c('#262626');
  // 5 hartslagzones, kleur oplopend qua intensiteit.
  const ZONE_KLEUR=['#22c55e','#3b82f6','#eab308','#ff6b1a','#8b5cf6'];
  const ZONE_NAAM=['Herstel','D1','D2','D3','Weerstand'];

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
  const veiligPdfTekst=(s)=>String(s==null?'':s).replace(/[^\x20-\x7E\xA0-\xFF]/g,'').trim()||'Sporter';

  const naam=veiligPdfTekst(meta.naam||'Sporter');
  const op=parseInt(meta.omslagpunt)||null;           // omslagpunt in bpm
  const maxHf=parseInt(meta.maxHf)||null;
  const score=meta.score!=null&&meta.score!==''?meta.score:null;
  const uren=meta.uren!=null&&meta.uren!==''?Number(meta.uren):null;
  const vo2=meta.vo2max!=null&&meta.vo2max!==''?Number(meta.vo2max):null;
  const ritten=meta.ritten!=null&&meta.ritten!==''?Number(meta.ritten):null;
  // Op het HR-spoor levert strava-callback 5 zones (index 5 blijft 0). We pakken
  // de eerste vijf; ontbreekt er data, dan tonen we de kaart met nullen.
  const zones=(meta.zones||'').split('-').map(n=>parseInt(n)||0).slice(0,5);
  while (zones.length<5) zones.push(0);

  // ---------- HEADER ----------
  txt('MICHEL KREDER COACHING',M,y-10,{font:bold,size:12});
  const datum=new Date().toLocaleDateString('nl-NL',{day:'numeric',month:'long',year:'numeric'});
  txt('TRAININGSRAPPORT',R,y-2,{font:bold,size:8,color:DIM,align:'right'});
  txt(`Analyse · laatste 90 dagen${ritten?` · ${ritten} ritten`:''}`,R,y-14,{font:reg,size:8,color:DIM,align:'right'});
  txt(datum,R,y-26,{font:reg,size:8,color:DIM,align:'right'});
  y-=46;
  txt('Hartslagprofiel',M,y-26,{font:bold,size:30});
  txt('Persoonlijk hartslagprofiel voor '+naam,M,y-42,{font:reg,size:10,color:MUT});
  if (score!=null){ txt(String(score),R,y-30,{font:bold,size:46,color:ORANJE,align:'right'}); txt('TRAINING SCORE',R,y-44,{font:bold,size:7,color:DIM,align:'right'}); }
  y-=58;
  txt('INZICHT.',M,y,{font:bold,size:10,color:WIT});
  txt(' TRAIN GERICHT.',M+bold.widthOfTextAtSize('INZICHT.',10),y,{font:bold,size:10,color:ORANJE});
  txt(' WORD STERKER.',M+bold.widthOfTextAtSize('INZICHT. TRAIN GERICHT.',10),y,{font:bold,size:10,color:WIT});
  y-=16; page.drawLine({start:{x:M,y},end:{x:R,y},thickness:1,color:BORDER}); y-=18;

  // ---------- OMSLAGPUNT DETECTOR ----------
  const opH=92; ensure(opH);
  card(M,y-opH,R-M,opH,{fill:CARD2,border:BORDERO});
  txt('OMSLAGPUNT DETECTOR',M+16,y-20,{font:bold,size:9,color:ORANJE});
  txt(op?String(op):'—',M+16,y-58,{font:bold,size:40,color:WIT});
  if(op)txt('BPM',M+16+bold.widthOfTextAtSize(String(op),40)+8,y-58,{font:bold,size:13,color:DIM});
  // Betrouwbaarheid: 'hoog' uit hartslag-streams, anders 'schatting'. De badge
  // is NIET meer hardcoded: bij een schatting (of geen omslagpunt) staat er
  // "DOE EERST EEN VELDTEST" i.p.v. "GEEN INSPANNINGSTEST NODIG".
  const opBron = meta.omslagpuntBetrouwbaarheid;
  let betr = op ? 'hoog' : '—', betrK = GROEN, testNodig = false;
  if (op && opBron !== 'hoog') { betr='schatting'; betrK=ORANJE; testNodig=true; }
  if (!op) testNodig = true;
  txt(`Je drempelhartslag${maxHf?` · max ${maxHf} bpm`:''}`,M+16,y-76,{font:reg,size:8.5,color:MUT});
  txt('Betrouwbaarheid: ',R-16-bold.widthOfTextAtSize(betr,8.5),y-20,{font:reg,size:8.5,color:MUT,align:'right'});
  txt(betr,R-16,y-20,{font:bold,size:8.5,color:betrK,align:'right'});
  const badgeTxt = testNodig ? 'DOE EERST EEN VELDTEST' : 'GEEN INSPANNINGSTEST NODIG';
  const badgeKl  = testNodig ? ROOD : ORANJE;
  const pillW = Math.max(138, bold.widthOfTextAtSize(badgeTxt,7.5) + 20);
  page.drawRectangle({x:R-16-pillW,y:y-72,width:pillW,height:20,color:badgeKl});
  txt(badgeTxt,R-16-pillW/2,y-66,{font:bold,size:7.5,color:WIT,align:'center'});
  y-=opH+14;

  // ---------- HARTSLAGZONES (verdeling + bpm-grenzen) ----------
  const zoneCardH=34+ZONE_NAAM.length*21+12;
  ensure(zoneCardH);
  card(M,y-zoneCardH,R-M,zoneCardH);
  txt('JOUW HARTSLAGZONES · WAAR TRAINDE JIJ? (bpm)',M+16,y-20,{font:bold,size:9,color:WIT});
  const z=(i)=>zones[i]||0;
  const laagTot=z(0)+z(1), grijsTot=z(2), kwalTot=z(3)+z(4), polen=laagTot+kwalTot;
  const kwalAandeel=polen>0?(kwalTot/polen)*100:0;
  const badgeVoor=(nm)=>{
    if(nm==='D3'||nm==='Weerstand'){ if(kwalAandeel>=13&&kwalAandeel<=30)return 'goed'; return kwalAandeel<13?'laag':'hoog'; }
    if(nm==='Herstel'||nm==='D1'){ if(laagTot>=75)return 'goed'; if(laagTot>=58)return 'ok'; return 'laag'; }
    if(nm==='D2')return grijsTot>12?'hoog':'ok';
    return 'ok';
  };
  const badgeTekst=(b)=>b==='goed'?'GOED':b==='laag'?'LAAG':b==='hoog'?'TE HOOG':'OK';
  const badgeKleur=(b)=>b==='goed'?GROEN:(b==='laag'||b==='hoog')?ORANJE:DIM;
  // bpm-grenzen t.o.v. het omslagpunt: <75 / 75-85 / 85-90 / 90-100 / >100%.
  const grenzen=(i)=>{ if(!op)return ''; if(i===0)return `< ${Math.round(op*0.75)}`; if(i===ZONE_NAAM.length-1)return `> ${op}`; const p=[[0,0.75],[0.75,0.85],[0.85,0.90],[0.90,1.00]]; const [lo,hi]=p[i]; return `${Math.round(op*lo)}–${Math.round(op*hi)}`; };
  const maxPct=Math.max(...zones,1), barX=M+150, barW=R-barX-110;
  ZONE_NAAM.forEach((nm,i)=>{ const cy=y-38-i*21; txt(nm,M+16,cy,{font:bold,size:9.5,color:WIT}); txt(grenzen(i),M+86,cy,{font:reg,size:7.5,color:DIM}); page.drawRectangle({x:barX,y:cy-2,width:barW,height:7,color:TRACK}); const fw=Math.max(barW*(z(i)/Math.max(maxPct,1)),z(i)>0?3:0); if(fw>0)page.drawRectangle({x:barX,y:cy-2,width:fw,height:7,color:c(ZONE_KLEUR[i]||'#6b7280')}); txt(`${z(i)}%`,barX+barW+26,cy,{font:bold,size:9,color:MUT,align:'right'}); const b=badgeVoor(nm); const bx=R-58; page.drawRectangle({x:bx,y:cy-3,width:54,height:13,color:CARD,borderColor:badgeKleur(b),borderWidth:0.8}); txt(badgeTekst(b),bx+27,cy,{font:bold,size:7,color:badgeKleur(b),align:'center'}); });
  y-=zoneCardH+14;

  // ---------- KRITIEKE BEVINDING: 0 sessies boven omslagpunt ----------
  if (vo2!=null && Number(vo2)===0) {
    const lines=wrapTxt('In 90 dagen deed je 0 sessies boven je omslagpunt. Dit is meestal de hoofdoorzaak van een prestatieplateau — je motor krijgt geen groeiprikkel.',reg,9.5,R-M-32);
    const kh=24+lines.length*13+10; ensure(kh);
    card(M,y-kh,R-M,kh,{fill:c('#1c1010'),border:c('#5a2424')});
    txt('KRITIEKE BEVINDING',M+16,y-18,{font:bold,size:8,color:ROOD});
    lines.forEach((ln,idx)=>txt(ln,M+16,y-32-idx*13,{font:reg,size:9.5,color:c('#d8b0b0')}));
    y-=kh+14;
  }

  // ---------- ACTIEPLAN (op gevoel/RPE) ----------
  const acties=[
    'Train minimaal 3x per week — consistent, elke week, geen uitzonderingen.',
    op?`Voeg 1x per week een blok boven je omslagpunt toe: 4×4 min op RPE 9/10 (Weerstand, > ${op} bpm) met 3 min herstel.`:'Voeg 1x per week een intervalblok toe: 4×4 min op RPE 9/10 met 3 min herstel.',
    'Zet je trainingen vast in je agenda: bv. di duur, do intervallen, zo lange rustige rit.'
  ];
  const actLines=acties.map(a=>wrapTxt(a,reg,9.5,R-M-58));
  const actH=24+actLines.reduce((s,l)=>s+Math.max(l.length*12,12)+8,0)+6;
  ensure(actH);
  card(M,y-actH,R-M,actH);
  txt('JOUW ACTIEPLAN',M+16,y-18,{font:bold,size:9,color:WIT});
  let ay=y-36;
  actLines.forEach((lines,i)=>{ page.drawCircle({x:M+24,y:ay-3,size:9,color:ORANJE}); txt(String(i+1),M+24,ay-6,{font:bold,size:8,color:WIT,align:'center'}); lines.forEach((ln,idx)=>txt(ln,M+44,ay-idx*12,{font:reg,size:9.5,color:MUT})); ay-=Math.max(lines.length*12,12)+8; });
  y-=actH+14;

  // ---------- INTERVALBLOKKEN (RPE-gestuurd) ----------
  // Op hartslag stuur je op gevoel, niet op een exact getal: je HF loopt aan het
  // begin van een interval achter en piekt pas laat. Vandaar RPE + zone i.p.v. bpm.
  const meerVolume = (uren||0) >= 8;
  const blokken=[];
  if (meerVolume){
    blokken.push({type:'DUURKRACHT — DREMPELBLOK · 1X PER WEEK', oms:'5×8 min op D3 (net onder je omslagpunt) · RPE 7/8 · 4 min rust', det:'Bouwt je aerobe motor en drempel zonder je leeg te trekken. Comfortabel zwaar — je kunt nog korte zinnen praten, niet meer dan dat. Één keer per week is genoeg.'});
    blokken.push({type:'VO2MAX — OPTIE A · LANGE MICRO-INTERVALLEN', oms:'40-20 op Weerstand · RPE 9/10 · 2–3 blokken van 8–12 min, 5 min rust', det:'40 sec vol, 20 sec rustig dóórdraaien. Je hartslag kruipt over het blok richting je max — maximale prikkel voor je zuurstofopname. 1x per week.'});
    blokken.push({type:'VO2MAX — OPTIE B · LANGERE REPS', oms:'3–4 min op Weerstand · RPE 9 · 4–5 herhalingen, 3 min rust', det:'Langere inspanningen net iets rustiger ingezet. Goed alternatief als de 40-20 te zwaar voelt, of voor variatie. Kies één optie per week.'});
  } else {
    blokken.push({type:'DUURKRACHT — DREMPELBLOK · 1X PER WEEK', oms:'5×5 min op D3 (net onder je omslagpunt) · RPE 7/8 · 3 min rust', det:'De efficiënte manier om je aerobe basis te bouwen als je weinig tijd hebt. Comfortabel zwaar, niet vol. Één keer per week — vaker is niet nodig.'});
    blokken.push({type:'VO2MAX — OPTIE A · KORTE MICRO-INTERVALLEN', oms:'20-10 op Weerstand · RPE 9 · 2–3 blokken van 8–12 min, 5 min rust', det:'20 sec aan, 10 sec uit. Toegankelijk maar effectief — je houdt het vol terwijl de prikkel hoog blijft. Ideaal als je minder fietst. 1x per week.'});
    blokken.push({type:'VO2MAX — OPTIE B · PITTIGER', oms:'30-30 op Weerstand · RPE 9/10 · 2–3 blokken van 8–12 min, 5 min rust', det:'30 sec stevig, 30 sec rustig. Iets meer bite dan de 20-10. Kies één van beide opties per week voor afwisseling.'});
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

  // ---------- CTA ----------
  const ctaH=58; ensure(ctaH+24);
  card(M,y-ctaH,R-M,ctaH,{fill:CARD2,border:BORDERO});
  txt('VAN INZICHT NAAR UITVOERING',M+16,y-18,{font:bold,size:9,color:ORANJE});
  txt('Een persoonlijk trainingsschema vertaalt dit rapport naar week-voor-week training — vanaf €59.',M+16,y-34,{font:reg,size:9,color:MUT});
  txt('michelkredercoaching.nl/trainingsschemas',M+16,y-49,{font:bold,size:9,color:WIT});

  txt('Trainingsrapport · Michel Kreder Coaching · momentopname op basis van je Strava-data.',M,26,{font:reg,size:7,color:DIM});

  return await doc.save();
}
