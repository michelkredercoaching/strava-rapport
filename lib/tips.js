// Tip van Michel (12-10-2026): de bibliotheek voor de MKC-app.
// Elke tip: c = categorie, k = kop (één zin die blijft hangen), t = uitleg,
// v = vervolgvraag voor de coach.
// Categorieën:
//   alg                        voor iedereen
//   sneller/evenement/afvallen/fit   per doel
//   winter/voorjaar/zomer/najaar     per seizoen
//   core (wie de Core doet), schema (wie een schema volgt), hartslag (traint op hartslag)
// Regels: Michels toon, geen gedachtestreepjes, geen verzonnen cijfers.
export const TIPS = [
  // ---- Algemeen: trainen ----
  { c: 'alg', k: 'Rustig is echt rustig.', t: 'Kun je op je duurrit nog makkelijk praten, dan zit je goed. Wie op rustige dagen te hard gaat, heeft op de zware dag niks meer over.', v: 'Hoe weet ik of ik rustig genoeg rijd?' },
  { c: 'alg', k: 'Eén goede zware training wint van drie halve.', t: 'Plan je zware dag na een rustige dag. Dan kun je hem ook echt zwaar maken.', v: 'Hoe verdeel ik zware en rustige dagen over mijn week?' },
  { c: 'alg', k: 'Het grijze gebied voelt goed, maar brengt weinig.', t: 'Elke rit net te hard is te zwaar om te herstellen en te licht om echt sterker te worden. Kies: rustig, of echt doorwerken.', v: 'Wat is het grijze gebied en hoe vermijd ik het?' },
  { c: 'alg', k: 'Vorm komt in de rust, niet in de training.', t: 'Training is de prikkel, herstel is waar je sterker wordt. Sla je rust over, dan sla je je vooruitgang over.', v: 'Hoeveel rustdagen heb ik nodig?' },
  { c: 'alg', k: 'Een rustweek is geen verloren week.', t: 'Na drie weken opbouwen even gas terug laat je lichaam de training verwerken. Daarna ga je er sterker uit.', v: 'Waarom zijn rustweken zo belangrijk?' },
  { c: 'alg', k: 'Vergelijk jezelf met vier weken geleden.', t: 'Per rit zie je weinig, per maand zie je alles. Kijk naar je trend, niet naar die ene slechte dag.', v: 'Hoe meet ik of ik vooruit ga?' },
  { c: 'alg', k: 'Moe aan de start? Maak het een rustig uur.', t: 'Een training doordrukken terwijl je leeg bent kost meer dan hij oplevert. Morgen ben je er beter van.', v: 'Wanneer kan ik een training beter aanpassen?' },
  { c: 'alg', k: 'Werkstress telt ook als training.', t: 'Je lichaam maakt geen onderscheid tussen een zware week op het werk en een zware week op de fiets. Drukke week? Haal er wat intensiteit uit.', v: 'Hoe pas ik mijn training aan in een drukke week?' },
  { c: 'alg', k: 'Consistent wint van heroïsch.', t: 'Vier gewone weken achter elkaar leveren meer op dan één monsterweek en daarna een week niks.', v: 'Hoe blijf ik consistent trainen met een volle agenda?' },
  { c: 'alg', k: 'Warm op voor je zware werk.', t: 'Tien tot vijftien minuten rustig, met een paar korte versnellingen. Je eerste blok gaat dan beter, en je laatste ook.', v: 'Hoe ziet een goede warming-up eruit?' },
  { c: 'alg', k: 'Cadans spaart je benen.', t: 'Rond de 85 tot 95 omwentelingen houdt je spieren frisser op lange ritten. Trap je zwaar en traag, schakel een tandje lichter.', v: 'Welke cadans is goed voor mij?' },
  { c: 'alg', k: 'Klimmen is geduld.', t: 'Begin een lange klim rustiger dan je denkt en bouw op naar boven. Wie onderaan vol gaat, staat halverwege stil.', v: 'Hoe rijd ik een lange klim slim?' },
  { c: 'alg', k: 'Je FTP is geen vast getal.', t: 'Hij beweegt mee met je vorm. Test elke zes tot acht weken opnieuw, anders train je op oude zones.', v: 'Hoe vaak moet ik mijn FTP testen?' },
  { c: 'alg', k: 'Zones zijn je kompas.', t: 'Zonder zones is elke training een gok. Met zones weet je precies wat een training moet doen.', v: 'Hoe gebruik ik mijn zones in de praktijk?' },
  { c: 'alg', k: 'Een plan maakt kiezen makkelijk.', t: 'Wie elke ochtend moet bedenken wat hij gaat doen, kiest vaak het makkelijkste of het hardste. Een plan haalt die twijfel weg.', v: 'Waarom werkt trainen met een schema beter?' },
  { c: 'alg', k: 'Minder uren kan meer opleveren.', t: 'Met zes tot acht uur per week en de juiste opbouw kom je verder dan met twaalf uur zonder richting.', v: 'Hoe haal ik het meeste uit weinig uren?' },
  // ---- Algemeen: herstel en slaap ----
  { c: 'alg', k: 'Slaap is je goedkoopste prestatieverbeteraar.', t: 'Een week lang een half uur eerder naar bed merk je op de fiets. Geen supplement doet dat.', v: 'Hoeveel invloed heeft slaap op mijn herstel?' },
  { c: 'alg', k: 'Je herstel begint aan tafel.', t: 'Eet binnen een uur na een zware rit iets met koolhydraten en eiwit. Dan vul je je tank voor de volgende training.', v: 'Wat eet ik het beste na een zware training?' },
  { c: 'alg', k: 'Actief herstel is rustig, echt rustig.', t: 'Een herstelrit is een half uur tot een uur op zacht tempo. Gaat het vanzelf harder, dan is het geen herstel meer.', v: 'Hoe rijd ik een goede herstelrit?' },
  { c: 'alg', k: 'Zware benen na een rustweek is normaal.', t: 'De eerste rit na een rustweek voelt vaak stroef. Geef het een dag, dan komt de pit terug.', v: 'Waarom voelen mijn benen zwaar na een rustweek?' },
  { c: 'alg', k: 'Ziek boven je nek? Rustig fietsen kan. Eronder niet.', t: 'Een loopneus is geen ramp. Koorts, spierpijn of iets op je borst wel: dan rust je, ook al voelt het zonde.', v: 'Mag ik trainen als ik verkouden ben?' },
  // ---- Algemeen: voeding ----
  { c: 'alg', k: 'Eet voordat je honger hebt.', t: 'Op een rit van meer dan anderhalf uur begin je in het eerste uur al met eten. Wacht je tot je honger hebt, dan ben je te laat.', v: 'Wanneer moet ik beginnen met eten op de fiets?' },
  { c: 'alg', k: 'Drink op schema, niet op dorst.', t: 'Een bidon per uur is een goed begin. Bij warmte meer. Dorst is een late waarschuwing.', v: 'Hoeveel moet ik drinken op een lange rit?' },
  { c: 'alg', k: 'De man met de hamer is een voedingsfout.', t: 'Vrijwel altijd is het een lege tank, geen gebrek aan conditie. Genoeg koolhydraten onderweg voorkomt hem.', v: 'Hoe voorkom ik dat ik de man met de hamer tegenkom?' },
  { c: 'alg', k: 'Train je darmen ook.', t: 'Veel eten op de fiets moet je oefenen. Bouw het op je lange trainingsritten op, dan kan het op de grote dag ook.', v: 'Hoe wen ik aan meer koolhydraten op de fiets?' },
  { c: 'alg', k: 'Een goed ontbijt is je eerste bidon.', t: 'Voor een lange rit eet je twee tot drie uur van tevoren iets met koolhydraten. Dan begin je met een volle tank.', v: 'Wat eet ik voor een lange rit?' },
  // ---- Algemeen: materiaal ----
  { c: 'alg', k: 'Check je banden voor elke rit.', t: 'De juiste spanning scheelt in comfort, grip en snelheid. En het kost je tien seconden.', v: 'Waarom maakt bandenspanning zoveel uit?' },
  { c: 'alg', k: 'Harder pompen is niet sneller.', t: 'Op echte wegen rolt een iets zachtere band vaak beter, omdat hij over oneffenheden heen rolt in plaats van te stuiteren.', v: 'Waarom is harder pompen niet altijd sneller?' },
  { c: 'alg', k: 'Een schone ketting is gratis snelheid.', t: 'Een vieze ketting kost watts en slijt je tandwielen. Even afnemen en smeren na een natte rit scheelt veel.', v: 'Hoe vaak moet ik mijn ketting schoonmaken?' },
  { c: 'alg', k: 'Pijn op de fiets is een signaal.', t: 'Knie, rug of nek die blijft zeuren, zit vaak in je houding of je zadel. Laat het checken in plaats van door te rijden.', v: 'Wat kan ik doen tegen pijn op de fiets?' },
  { c: 'alg', k: 'Wind tegen op de heenweg is een cadeau.', t: 'Start tegen de wind in, dan heb je hem mee als je moe bent. De windkaart in de app wijst je de richting.', v: 'Hoe plan ik mijn rit met de wind?' },
  // ---- Algemeen: hoofd ----
  { c: 'alg', k: 'Motivatie volgt op actie.', t: 'Geen zin? Spreek met jezelf af dat je tien minuten rijdt. Meestal rij je daarna gewoon door.', v: 'Hoe kom ik door een motivatiedip heen?' },
  { c: 'alg', k: 'Een plateau is geen eindpunt.', t: 'Sta je stil, dan heeft je lichaam iets nieuws nodig: een andere prikkel, meer rust of een betere opbouw. Niet per se meer uren.', v: 'Hoe doorbreek ik een plateau?' },
  { c: 'alg', k: 'Vergelijk je niet met Strava.', t: 'Je ziet alleen de beste ritten van anderen. Jouw enige echte tegenstander ben jij van vorige maand.', v: 'Hoe ga ik om met vergelijken op Strava?' },
  { c: 'alg', k: 'Een gemiste training is geen gemiste week.', t: 'Gewoon de volgende training doen zoals gepland. Inhalen door alles op te stapelen kost je meer dan het oplevert.', v: 'Wat doe ik als ik een training mis?' },
  { c: 'alg', k: 'Rijd met een groep die iets harder is.', t: 'Af en toe met sterkere renners mee leert je wiel houden, positie kiezen en dieper gaan dan je alleen zou doen.', v: 'Hoe leer ik beter rijden in een groep?' },

  // ---- Sneller worden ----
  { c: 'sneller', k: 'Sneller worden zit in je drempel.', t: 'Blokken net onder je FTP, bijvoorbeeld twee keer twintig minuten, doen meer dan elke rit vol gas.', v: 'Hoe train ik mijn FTP omhoog?' },
  { c: 'sneller', k: 'Sweetspot geeft veel voor weinig.', t: 'Net onder je drempel bouw je veel vermogen op met relatief weinig vermoeidheid. Ideaal als je weinig tijd hebt.', v: 'Wat is sweetspot en hoe train ik dat?' },
  { c: 'sneller', k: 'Weet je je FTP niet zeker? Dan gok je.', t: 'Een goede test of analyse is de basis. Anders train je in de verkeerde zones, en dat zie je pas weken later.', v: 'Hoe bepaal ik mijn FTP?' },
  { c: 'sneller', k: 'VO2max-werk is kort en pijnlijk, en het werkt.', t: 'Blokken van drie tot vijf minuten echt diep. Eén keer per week is voor de meeste renners genoeg.', v: 'Hoe train ik mijn VO2max?' },
  { c: 'sneller', k: 'Een sterke basis tilt alles op.', t: 'Rustige duururen lijken saai, maar ze vergroten je motor. Daarop bouw je je snelheid.', v: 'Waarom zijn rustige duurritten belangrijk om sneller te worden?' },
  { c: 'sneller', k: 'Watt per kilo telt bergop, watts tellen op het vlakke.', t: 'Kijk wat jij wilt: snel bergop of hard op het vlakke. Je training en je focus verschillen.', v: 'Moet ik focussen op watts of op watt per kilo?' },
  { c: 'sneller', k: 'Sprinten leer je fris.', t: 'Sprintwerk doe je aan het begin van je training, niet aan het eind met lege benen. Kwaliteit boven aantal.', v: 'Hoe train ik mijn sprint?' },
  { c: 'sneller', k: 'Langer volhouden is ook sneller.', t: 'Je drempel na drie uur rijden is wat telt in een lange tocht. Train dus ook je duurvermogen, niet alleen je piek.', v: 'Hoe train ik mijn uithoudingsvermogen?' },
  { c: 'sneller', k: 'Hertest na een blok, niet midden in.', t: 'Na een rustweek zie je wat de training echt heeft gedaan. Midden in een zware periode test je je vermoeidheid.', v: 'Wanneer is het beste moment om te testen?' },
  { c: 'sneller', k: 'Je zwakke punt is je snelste winst.', t: 'Ben je sterk bergop maar zwak in de wind, of andersom? Daar zit de meeste vooruitgang voor de minste moeite.', v: 'Hoe vind ik mijn zwakke punt als renner?' },

  // ---- Tocht of wedstrijd ----
  { c: 'evenement', k: 'Op de grote dag probeer je niets nieuws.', t: 'Geen nieuwe gels, schoenen of zadel. Alles wat je die dag gebruikt, heb je getest op je lange ritten.', v: 'Hoe test ik mijn voeding en materiaal voor mijn tocht?' },
  { c: 'evenement', k: 'De laatste week maakt je fris, niet fitter.', t: 'Minder uren, een paar korte prikkels en vooral goed slapen. Fitter word je in die week niet meer.', v: 'Wat doe ik in de week voor mijn tocht?' },
  { c: 'evenement', k: 'Het eerste uur bepaalt je laatste uur.', t: 'Begin rustiger dan je denkt. Wat je vroeg te hard gaat, betaal je aan het eind dubbel terug.', v: 'Hoe deel ik mijn krachten in op een lange tocht?' },
  { c: 'evenement', k: 'Ken je parcours.', t: 'Rijd een paar trainingen op vergelijkbaar terrein: lange klimmen, kasseien of gravel. Dan schrik je die dag nergens van.', v: 'Hoe bereid ik me voor op het parcours van mijn tocht?' },
  { c: 'evenement', k: 'Je langste trainingsrit is je generale repetitie.', t: 'Rijd hem op hetzelfde tempo, met dezelfde voeding en dezelfde kleding als op de dag zelf.', v: 'Hoe lang moet mijn langste trainingsrit zijn?' },
  { c: 'evenement', k: 'Eten op schema, niet op gevoel.', t: 'Zet een herinnering op je fietscomputer, bijvoorbeeld elk half uur. In de drukte van een tocht vergeet je het anders.', v: 'Hoeveel moet ik eten tijdens mijn tocht?' },
  { c: 'evenement', k: 'Leg je spullen de avond ervoor klaar.', t: 'Kleding, voeding, nummer, banden gecheckt. Dan begin je de ochtend rustig in plaats van zoekend.', v: 'Wat neem ik mee naar mijn tocht?' },
  { c: 'evenement', k: 'Slaap twee nachten ervoor telt het zwaarst.', t: 'De nacht voor een tocht slaap je vaak slecht van de spanning. Dat is normaal. Zorg dat je de nachten ervoor goed slaapt.', v: 'Wat als ik slecht slaap voor mijn tocht?' },
  { c: 'evenement', k: 'Een tocht van zes uur rijd je niet op karakter.', t: 'Je rijdt hem op tempo, voeding en een goede indeling. Karakter heb je nodig voor het laatste uur, niet voor de eerste vijf.', v: 'Hoe maak ik een plan voor mijn tocht?' },
  { c: 'evenement', k: 'Plan je opbouw terug vanaf de datum.', t: 'Begin bij de dag zelf en reken terug: wanneer je langste rit, wanneer je rustweek, wanneer je afbouwt.', v: 'Hoe plan ik mijn opbouw naar mijn tocht?' },

  // ---- Afvallen ----
  { c: 'afvallen', k: 'Afvallen en sneller worden gaat samen.', t: 'Zolang je op trainingsdagen genoeg eet. Bespaar liever op rustdagen, dan blijven je watts staan.', v: 'Hoe val ik af zonder watts te verliezen?' },
  { c: 'afvallen', k: 'Train niet nuchter als je zwaar gaat.', t: 'Een rustige duurrit nuchter kan. Een zware training zonder brandstof kost je kwaliteit en spiermassa.', v: 'Kan ik nuchter trainen om af te vallen?' },
  { c: 'afvallen', k: 'Eiwit bij elke maaltijd.', t: 'Het houdt je langer vol en beschermt je spieren als je minder eet. Spreid het over de dag.', v: 'Hoeveel eiwit heb ik nodig als wielrenner?' },
  { c: 'afvallen', k: 'Kijk naar het gemiddelde, niet naar de weegschaal van vandaag.', t: 'Je gewicht schommelt per dag door vocht en eten. Weeg een paar keer per week en volg de trend.', v: 'Hoe houd ik mijn gewicht goed bij?' },
  { c: 'afvallen', k: 'Een lange rit is geen vrijbrief.', t: 'Je verbrandt veel, maar ook de beloning erna telt mee. Eet goed na je rit, en houd het daarna normaal.', v: 'Hoeveel mag ik eten na een lange rit?' },
  { c: 'afvallen', k: 'Langzaam afvallen blijft eraf.', t: 'Een kleine, haalbare daling per week houdt je sterk op de fiets. Crashdiëten kosten je vermogen en motivatie.', v: 'Hoe snel kan ik verantwoord afvallen?' },
  { c: 'afvallen', k: 'Drinken is ook eten.', t: 'Frisdrank, sapjes en alcohol tellen flink mee zonder dat je er vol van zit. Daar zit vaak de makkelijkste winst.', v: 'Wat zijn de makkelijkste dingen om te laten staan?' },
  { c: 'afvallen', k: 'Slaap tekort maakt hongerig.', t: 'Na een korte nacht heb je meer trek, vooral in snelle suikers. Goed slapen helpt dus ook bij afvallen.', v: 'Hoe helpt slaap bij afvallen?' },

  // ---- Fit blijven en plezier ----
  { c: 'fit', k: 'Plezier houdt je op de fiets.', t: 'Rij eens een nieuwe route, of plan een rit met vrienden via de groepsrit in de app.', v: 'Hoe houd ik het leuk en blijf ik gemotiveerd?' },
  { c: 'fit', k: 'Twee of drie keer per week is genoeg.', t: 'Om fit te blijven wint regelmaat het van af en toe heel lang.', v: 'Hoe vaak moet ik rijden om fit te blijven?' },
  { c: 'fit', k: 'Af en toe stevig doortrappen houdt je scherp.', t: 'Een paar keer per rit een stuk tempo maakt je conditie sterker, zonder dat het zwaar voelt.', v: 'Hoe blijf ik fit zonder strak schema?' },
  { c: 'fit', k: 'Kies een doel, hoe klein ook.', t: 'Een rondje sneller, een nieuwe klim of een tocht met vrienden. Een doel geeft je ritten richting.', v: 'Welk doel past bij mij?' },
  { c: 'fit', k: 'Bewegen naast de fiets helpt.', t: 'Een wandeling, wat core of even rekken. Je lijf houdt van afwisseling, en je rug zeker.', v: 'Wat kan ik naast fietsen doen om fit te blijven?' },
  { c: 'fit', k: 'Elke rit telt.', t: 'Een uurtje rustig is niet minder waard dan een lange tocht. Het gaat om wat je volhoudt.', v: 'Heeft een kort ritje wel zin?' },
  { c: 'fit', k: 'Rij eens zonder meter.', t: 'Een rit op gevoel, zonder te kijken naar snelheid of watts. Gewoon genieten van de weg.', v: 'Is het goed om soms zonder data te rijden?' },

  // ---- Winter ----
  { c: 'winter', k: 'In de winter leg je je voorjaar.', t: 'Rustige uren en wat drempelwerk op de trainer betalen zich in april terug.', v: 'Wat train ik in de winter?' },
  { c: 'winter', k: 'Een uur op de trainer is anders dan een uur buiten.', t: 'Binnen trap je continu door. Een uur gericht werk is daarom vaak zwaarder dan je denkt.', v: 'Hoe lang moet ik op de trainer trainen?' },
  { c: 'winter', k: 'Vertrek koud, kom droog terug.', t: 'Kleed je zo dat je de eerste tien minuten iets fris hebt. Warm vertrekken betekent nat van het zweet terugkomen.', v: 'Wat trek ik aan als het koud is?' },
  { c: 'winter', k: 'Zet een ventilator voor je trainer.', t: 'Koel blijven scheelt flink in hoe zwaar een training voelt, en je houdt het langer vol.', v: 'Hoe maak ik binnen trainen prettiger?' },
  { c: 'winter', k: 'Binnen gepompt is buiten zachter.', t: 'Bij kou zakt je spanning buiten. Pomp je binnen, pomp dan iets harder. De app rekent het voor je uit.', v: 'Hoe pomp ik mijn banden als het koud is?' },
  { c: 'winter', k: 'Handen en voeten eerst.', t: 'Koude vingers en tenen maken een rit ellendig. Goede handschoenen en overschoenen zijn je beste investering.', v: 'Hoe houd ik mijn handen en voeten warm?' },
  { c: 'winter', k: 'Ook in de kou drink je.', t: 'Je hebt minder dorst, maar je verliest nog steeds vocht. Neem je bidon gewoon mee, eventueel met lauw water.', v: 'Moet ik in de winter ook veel drinken?' },
  { c: 'winter', k: 'Gladheid? Kies de trainer.', t: 'Een val in januari kost je meer dan een rit binnen. Bij ijzel of sneeuw is binnen de slimste keuze.', v: 'Wanneer kan ik beter binnen trainen?' },
  { c: 'winter', k: 'De winter is het moment voor je core.', t: 'Minder uren op de fiets, meer tijd voor kracht en stabiliteit. Dat merk je in het voorjaar in je laatste uur.', v: 'Waarom is de winter een goed moment voor core training?' },

  // ---- Voorjaar ----
  { c: 'voorjaar', k: 'Bouw je uren rustig op.', t: 'Na de winter in een paar weken veel meer uren gaan rijden is vragen om overbelasting. Elke week een beetje meer.', v: 'Hoe bouw ik mijn uren op in het voorjaar?' },
  { c: 'voorjaar', k: 'De eerste lange rit mag rustig.', t: 'Je eerste rit van vier uur hoeft niet snel. Wennen aan de duur is het doel.', v: 'Hoe rijd ik mijn eerste lange ritten van het jaar?' },
  { c: 'voorjaar', k: 'Voorjaarsweer is verraderlijk.', t: 'Zon bij vertrek, hagel halverwege. Een windjack in je achterzak redt je rit.', v: 'Wat trek ik aan in het voorjaar?' },
  { c: 'voorjaar', k: 'Check je fiets na de winter.', t: 'Remmen, ketting, banden en kabels. Wat in de winter stilstond of in de pekel reed, verdient even aandacht.', v: 'Wat moet ik nakijken aan mijn fiets na de winter?' },

  // ---- Zomer ----
  { c: 'zomer', k: 'Hitte kost watts.', t: 'Bij warm weer ligt je vermogen lager bij dezelfde inspanning. Rijd op gevoel en hartslag, niet op je normale getallen.', v: 'Hoe train ik als het heel warm is?' },
  { c: 'zomer', k: 'Rij vroeg als het heet wordt.', t: 'In de ochtend is het koeler en rijd je beter. En je hebt de rest van de dag nog.', v: 'Wat is het beste moment om te rijden in de zomer?' },
  { c: 'zomer', k: 'Zout telt mee.', t: 'Als je veel zweet, verlies je ook zout. Op lange warme ritten helpt sportdrank meer dan alleen water.', v: 'Heb ik extra zout nodig als ik veel zweet?' },
  { c: 'zomer', k: 'Zonnebrand is ook materiaal.', t: 'Armen, nek en gezicht. Verbranden kost je herstel, en je huid onthoudt het.', v: 'Hoe bescherm ik me tegen de zon op de fiets?' },

  // ---- Najaar ----
  { c: 'najaar', k: 'Na je seizoen even echt rust.', t: 'Een of twee weken rustig of iets anders doen laat je lichaam en hoofd herstellen. Daarna begin je fris aan de winter.', v: 'Hoeveel rust neem ik na mijn seizoen?' },
  { c: 'najaar', k: 'Natte bladeren zijn ijs.', t: 'In bochten met blad op de weg remt en stuurt je fiets anders. Rustig aan, en niet hard remmen in de bocht.', v: 'Hoe rijd ik veilig in de herfst?' },
  { c: 'najaar', k: 'Verlichting aan, ook overdag.', t: 'Als de dagen korter worden, word je slechter gezien. Een goed achterlicht overdag is geen overbodige luxe.', v: 'Welke verlichting heb ik nodig?' },
  { c: 'najaar', k: 'Kijk terug voor je vooruit kijkt.', t: 'Wat ging goed dit jaar, wat niet? Daar haal je je plan voor volgend jaar uit.', v: 'Hoe evalueer ik mijn seizoen?' },

  // ---- Core ----
  { c: 'core', k: 'Een sterke romp brengt je kracht op de pedalen.', t: 'Anders lekt hij weg in een wiebelend bovenlijf. Vooral in het laatste uur van een rit.', v: 'Waarom helpt core training op de fiets?' },
  { c: 'core', k: 'Core op een rustige dag.', t: 'Doe je sessie op een rustdag of na een rustige rit, niet vlak voor een zware training. Dan train je beide goed.', v: 'Wanneer doe ik het beste mijn core training?' },
  { c: 'core', k: 'Drie keer kort wint van één keer lang.', t: 'Drie keer per week tien minuten maakt je sterker dan één keer een half uur.', v: 'Hoe vaak moet ik core trainen?' },
  { c: 'core', k: 'Rugpijn op de fiets zit vaak in je romp.', t: 'Een vermoeide romp laat je rug het werk doen. Core helpt, maar laat aanhoudende pijn altijd checken.', v: 'Kan core helpen tegen rugpijn op de fiets?' },
  { c: 'core', k: 'Techniek voor tijd.', t: 'Een plank van dertig seconden met een rechte rug is meer waard dan een minuut doorgezakt.', v: 'Hoe weet ik of ik mijn oefening goed doe?' },
  { c: 'core', k: 'Je Rompscore is je bewijs.', t: 'Doe je test op een frisse dag. Dan zie je over vier weken eerlijk wat het je heeft opgeleverd.', v: 'Hoe vaak moet ik mijn Rompscore testen?' },
  { c: 'core', k: 'Links en rechts zijn niet gelijk.', t: 'Bijna iedereen heeft een sterkere kant. Als je dat weet, kun je het bijtrekken, en dat merk je in je houding op de fiets.', v: 'Wat doe ik aan een verschil tussen links en rechts?' },

  // ---- Wie een schema volgt ----
  { c: 'schema', k: 'Lees de uitleg bij je training.', t: 'In TrainingPeaks staat bij elke training waarom je hem doet. Als je het doel snapt, rijd je hem beter.', v: 'Hoe haal ik het meeste uit mijn schema?' },
  { c: 'schema', k: 'Schuif liever dan dat je propt.', t: 'Lukt een dag niet, verschuif dan je training. Twee zware trainingen op één dag inhalen werkt niet.', v: 'Wat doe ik als mijn schema niet in mijn week past?' },
  { c: 'schema', k: 'Rustig op je schema is echt rustig.', t: 'Als er een rustige rit staat, heeft dat een reden. Je zware training morgen heeft er baat bij.', v: 'Waarom staan er zoveel rustige ritten in mijn schema?' },
  { c: 'schema', k: 'Je schema is een plan, geen wet.', t: 'Ziek, moe of een drukke week? Pas aan. Een schema helpt je, het moet je niet slopen.', v: 'Wanneer mag ik afwijken van mijn schema?' },
  { c: 'schema', k: 'Vink je trainingen af.', t: 'Als je ze afvinkt in TrainingPeaks, zie je je eigen consistentie groeien. Dat motiveert meer dan je denkt.', v: 'Hoe houd ik mijn schema goed bij?' },

  // ---- Wie op hartslag traint ----
  { c: 'hartslag', k: 'Je hartslag loopt achter.', t: 'Bij een korte, harde inspanning heeft je hartslag even nodig om omhoog te komen. Kijk bij korte blokken naar je gevoel.', v: 'Hoe train ik korte blokken op hartslag?' },
  { c: 'hartslag', k: 'Warm weer, hogere hartslag.', t: 'Bij warmte of na een korte nacht ligt je hartslag hoger bij hetzelfde tempo. Dat is normaal, pas je tempo aan.', v: 'Waarom is mijn hartslag soms hoger dan normaal?' },
  { c: 'hartslag', k: 'Een borstband is preciezer dan je horloge.', t: 'Polsmeting kan afwijken, zeker bij intervallen. Voor je zones is een borstband betrouwbaarder.', v: 'Heb ik een hartslagband nodig?' },
  { c: 'hartslag', k: 'Je omslagpunt is je kompas.', t: 'Al je zones hangen eraan. Test het af en toe opnieuw, want het verschuift met je vorm.', v: 'Hoe bepaal ik mijn omslagpunt?' }
];

// Kies de tip van vandaag: een vaste volgorde per persoon, elke dag de volgende,
// zodat je pas na de hele lijst een tip terugziet.
export function tipVoor({ doel, core, schema, hartslag, datum = new Date() } = {}) {
  const m = datum.getMonth();
  const seizoen = m >= 10 || m <= 1 ? 'winter' : m <= 4 ? 'voorjaar' : m <= 7 ? 'zomer' : 'najaar';
  const pool = TIPS.filter((x) => x.c === 'alg' || x.c === seizoen || (doel && x.c === doel) || (core && x.c === 'core') || (schema && x.c === 'schema') || (hartslag && x.c === 'hartslag'));
  const dag = Math.floor((datum.getTime() + 2 * 3600e3) / 864e5);
  // Met een vaste stapgrootte door de lijst, zodat categorieën door elkaar komen
  // en je pas na de hele lijst een tip terugziet.
  const stap = [7, 11, 13, 17, 19].find((p) => pool.length % p !== 0) || 1;
  return pool[(dag * stap) % pool.length];
}
