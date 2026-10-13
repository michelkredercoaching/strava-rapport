// Tip van Michel (12-10-2026): een heel jaar rond.
// KALENDER: per maand minstens 31 tips die bij die tijd van het jaar passen
// (januari doelen en basis, april klassiekers, juli hitte en dalen, december
// feestdagen en terugblik). Elke dag van de maand zijn eigen tip.
// PERSOONLIJK: hooguit één dag per week een tip op maat (doel, Core, schema, hartslag).
// Elke tip: [kop, uitleg, vervolgvraag voor de coach].
// Regels: Michels toon, geen gedachtestreepjes, geen verzonnen cijfers.
export const KALENDER = {
  1: [
    ['Een nieuw jaar begint met één doel.', 'Kies één tocht of één getal waar je dit jaar naartoe werkt. Eén doel geeft al je ritten richting.', 'Hoe kies ik een goed doel voor dit jaar?'],
    ['Schrijf je doel op, met een datum.', 'Een doel zonder datum blijft een wens. Met een datum kun je terugrekenen wat je wanneer moet doen.', 'Hoe plan ik terug vanaf mijn doel?'],
    ['In januari leg je je voorjaar.', 'Rustige uren en wat drempelwerk betalen zich in april terug. Niemand wordt in januari kampioen, wel in januari voorbereid.', 'Wat train ik in de winter?'],
    ['Rustig is echt rustig.', 'Kun je op je duurrit nog makkelijk praten, dan zit je goed. Wie op rustige dagen te hard gaat, heeft op de zware dag niks meer over.', 'Hoe weet ik of ik rustig genoeg rijd?'],
    ['Vertrek koud, kom droog terug.', 'Kleed je zo dat je de eerste tien minuten iets fris hebt. Warm vertrekken betekent nat van het zweet terugkomen.', 'Wat trek ik aan als het koud is?'],
    ['Een uur op de trainer is geen uur buiten.', 'Binnen trap je continu door. Een uur gericht werk is daarom vaak zwaarder dan je denkt.', 'Hoe lang moet ik op de trainer trainen?'],
    ['Zet een ventilator voor je trainer.', 'Koel blijven scheelt flink in hoe zwaar een training voelt, en je houdt het langer vol.', 'Hoe maak ik binnen trainen prettiger?'],
    ['Consistent wint van heroïsch.', 'Vier gewone weken achter elkaar leveren meer op dan één monsterweek en daarna een week niks.', 'Hoe blijf ik consistent trainen met een volle agenda?'],
    ['Test je FTP aan het begin van het jaar.', 'Dan weet je waar je staat en train je vanaf dag één in de juiste zones. Over acht weken zie je wat het heeft gedaan.', 'Hoe test ik mijn FTP?'],
    ['Handen en voeten eerst.', 'Koude vingers en tenen maken een rit ellendig. Goede handschoenen en overschoenen zijn je beste winterinvestering.', 'Hoe houd ik mijn handen en voeten warm?'],
    ['Binnen gepompt is buiten zachter.', 'Bij kou zakt je spanning buiten. Pomp je binnen, pomp dan iets harder. De app rekent het voor je uit.', 'Hoe pomp ik mijn banden als het koud is?'],
    ['De winter is het moment voor je core.', 'Minder uren op de fiets, meer tijd voor kracht en stabiliteit. Dat merk je in het voorjaar in je laatste uur.', 'Waarom is de winter een goed moment voor core training?'],
    ['Gladheid? Kies de trainer.', 'Een val in januari kost je meer dan een rit binnen. Bij ijzel of sneeuw is binnen de slimste keuze.', 'Wanneer kan ik beter binnen trainen?'],
    ['Ook in de kou drink je.', 'Je hebt minder dorst, maar je verliest nog steeds vocht. Neem je bidon gewoon mee, eventueel met lauw water.', 'Moet ik in de winter ook veel drinken?'],
    ['Plan je week op zondag.', 'Kijk welke dagen druk zijn en zet je trainingen daaromheen. Dan hoef je niet elke dag opnieuw te kiezen.', 'Hoe plan ik mijn trainingsweek naast mijn werk?'],
    ['Krachttraining maakt je geen bodybuilder.', 'Twee korte sessies per week met squats, lunges en core maken je sterker op de fiets en blessurebestendiger.', 'Welke krachtoefeningen helpen mij op de fiets?'],
    ['Slaap is je goedkoopste prestatieverbeteraar.', 'Een week lang een half uur eerder naar bed merk je op de fiets. Geen supplement doet dat.', 'Hoeveel invloed heeft slaap op mijn herstel?'],
    ['Een plan maakt kiezen makkelijk.', 'Wie elke ochtend moet bedenken wat hij gaat doen, kiest vaak het makkelijkste of het hardste. Een plan haalt die twijfel weg.', 'Waarom werkt trainen met een schema beter?'],
    ['Het grijze gebied voelt goed, maar brengt weinig.', 'Elke rit net te hard is te zwaar om te herstellen en te licht om echt sterker te worden. Kies: rustig, of echt doorwerken.', 'Wat is het grijze gebied en hoe vermijd ik het?'],
    ['Donker en koud? Spreek af.', 'Met een maat afspreken maakt het veel moeilijker om af te haken. In de winter is dat goud waard.', 'Hoe blijf ik gemotiveerd in de winter?'],
    ['Winterkilometers zijn rustige kilometers.', 'Lange ritten in de kou op laag tempo bouwen je motor. Snelheid komt later wel.', 'Hoe hard moet ik in de winter rijden?'],
    ['Een trainer-uur mag kort en gericht.', 'Liever 45 minuten met een duidelijk doel dan anderhalf uur doelloos trappen voor een scherm.', 'Hoe maak ik een goede indoortraining?'],
    ['Rek je heupbuigers.', 'Uren gebogen op de fiets en achter een bureau maken je heupen stijf. Een paar minuten rekken per dag scheelt in je rug.', 'Welke rekoefeningen zijn goed voor wielrenners?'],
    ['Een rustweek is geen verloren week.', 'Na drie weken opbouwen even gas terug laat je lichaam de training verwerken. Daarna ga je er sterker uit.', 'Waarom zijn rustweken zo belangrijk?'],
    ['Zones zijn je kompas.', 'Zonder zones is elke training een gok. Met zones weet je precies wat een training moet doen.', 'Hoe gebruik ik mijn zones in de praktijk?'],
    ['Was je fiets na een natte winterrit.', 'Pekel en vuil vreten aan je ketting en remmen. Even afspoelen en de ketting smeren scheelt een dure reparatie.', 'Hoe onderhoud ik mijn fiets in de winter?'],
    ['Motivatie volgt op actie.', 'Geen zin? Spreek met jezelf af dat je tien minuten rijdt. Meestal rij je daarna gewoon door.', 'Hoe kom ik door een motivatiedip heen?'],
    ['Een gemiste training is geen gemiste week.', 'Gewoon de volgende training doen zoals gepland. Inhalen door alles op te stapelen kost je meer dan het oplevert.', 'Wat doe ik als ik een training mis?'],
    ['Wintervet is geen ramp.', 'Een paar kilo meer in de winter is normaal. Train consequent en eet normaal, dan gaat het er in het voorjaar vanzelf af.', 'Hoe ga ik om met gewicht in de winter?'],
    ['Warm op, zeker in de kou.', 'Koude spieren hebben langer nodig. Begin je rit of training altijd tien tot vijftien minuten rustig.', 'Hoe warm ik goed op?'],
    ['Kijk na een maand terug.', 'Hoeveel ritten, hoeveel uren, hoe voelde het? Een maand terugkijken laat je zien dat je beter bezig bent dan je denkt.', 'Hoe houd ik mijn voortgang bij?']
  ],
  2: [
    ['Februari is opbouwen.', 'De basis staat, nu komt er langzaam meer drempelwerk bij. Rustig verder bouwen, niet ineens alles tegelijk.', 'Hoe bouw ik mijn training op richting het voorjaar?'],
    ['Sneller worden zit in je drempel.', 'Blokken net onder je FTP, bijvoorbeeld twee keer twintig minuten, doen meer dan elke rit vol gas.', 'Hoe train ik mijn FTP omhoog?'],
    ['Sweetspot geeft veel voor weinig.', 'Net onder je drempel bouw je veel vermogen op met relatief weinig vermoeidheid. Ideaal als je weinig tijd hebt.', 'Wat is sweetspot en hoe train ik dat?'],
    ['Ziek boven je nek? Rustig fietsen kan. Eronder niet.', 'Een loopneus is geen ramp. Koorts, spierpijn of iets op je borst wel: dan rust je, ook al voelt het zonde.', 'Mag ik trainen als ik verkouden ben?'],
    ['Na ziekte rustig weer op.', 'Begin met een paar rustige ritten en bouw dan op. Te snel weer vol erin is de snelste weg terug naar bed.', 'Hoe bouw ik weer op na ziekte?'],
    ['Een trainingskamp begint thuis.', 'Ga je in het voorjaar naar de zon? Zorg dat je thuis al lange ritten hebt gereden, anders sloop je jezelf in de eerste dagen.', 'Hoe bereid ik me voor op een trainingskamp?'],
    ['Op trainingskamp is rust ook training.', 'Elke dag lang en hard houdt niemand een week vol. Plan een rustige dag halverwege.', 'Hoe verdeel ik een trainingsweek in de bergen?'],
    ['Eet voordat je honger hebt.', 'Op een rit van meer dan anderhalf uur begin je in het eerste uur al met eten. Wacht je tot je honger hebt, dan ben je te laat.', 'Wanneer moet ik beginnen met eten op de fiets?'],
    ['Je herstel begint aan tafel.', 'Eet binnen een uur na een zware rit iets met koolhydraten en eiwit. Dan vul je je tank voor de volgende training.', 'Wat eet ik het beste na een zware training?'],
    ['Eén goede zware training wint van drie halve.', 'Plan je zware dag na een rustige dag. Dan kun je hem ook echt zwaar maken.', 'Hoe verdeel ik zware en rustige dagen over mijn week?'],
    ['Interval op de trainer: kijk niet naar de klok.', 'Zet je blokken in een training en volg ze. Wie elke minuut naar de tijd staart, maakt het zwaarder dan het is.', 'Hoe houd ik een zware indoortraining vol?'],
    ['Vorm komt in de rust, niet in de training.', 'Training is de prikkel, herstel is waar je sterker wordt. Sla je rust over, dan sla je je vooruitgang over.', 'Hoeveel rustdagen heb ik nodig?'],
    ['Moe aan de start? Maak het een rustig uur.', 'Een training doordrukken terwijl je leeg bent kost meer dan hij oplevert. Morgen ben je er beter van.', 'Wanneer kan ik een training beter aanpassen?'],
    ['Werkstress telt ook als training.', 'Je lichaam maakt geen onderscheid tussen een zware week op het werk en een zware week op de fiets. Drukke week? Haal er wat intensiteit uit.', 'Hoe pas ik mijn training aan in een drukke week?'],
    ['Cadans spaart je benen.', 'Rond de 85 tot 95 omwentelingen houdt je spieren frisser op lange ritten. Trap je zwaar en traag, schakel een tandje lichter.', 'Welke cadans is goed voor mij?'],
    ['Train je cadans op de trainer.', 'Blokjes met een hogere cadans dan normaal maken je souplesse beter. Daar heb je buiten veel profijt van.', 'Hoe train ik een soepele trap?'],
    ['Een sterke basis tilt alles op.', 'Rustige duururen lijken saai, maar ze vergroten je motor. Daarop bouw je je snelheid.', 'Waarom zijn rustige duurritten belangrijk?'],
    ['Weet je je FTP niet zeker? Dan gok je.', 'Een goede test of analyse is de basis. Anders train je in de verkeerde zones, en dat zie je pas weken later.', 'Hoe bepaal ik mijn FTP?'],
    ['Drink op schema, niet op dorst.', 'Een bidon per uur is een goed begin. Bij warmte meer. Dorst is een late waarschuwing.', 'Hoeveel moet ik drinken op een lange rit?'],
    ['Beter een korte rit dan geen rit.', 'Vijfenveertig minuten met een paar korte versnellingen houdt je scherp in een drukke week.', 'Heeft een korte training wel zin?'],
    ['Train je darmen ook.', 'Veel eten op de fiets moet je oefenen. Bouw het op je lange trainingsritten op, dan kan het op de grote dag ook.', 'Hoe wen ik aan meer koolhydraten op de fiets?'],
    ['Een goed ontbijt is je eerste bidon.', 'Voor een lange rit eet je twee tot drie uur van tevoren iets met koolhydraten. Dan begin je met een volle tank.', 'Wat eet ik voor een lange rit?'],
    ['Plan je eerste tocht van het jaar.', 'Een datum in de agenda geeft je winterweken een doel. Een toertocht in het voorjaar is een mooie eerste stip.', 'Welke tocht past bij mij als eerste doel?'],
    ['Minder uren kan meer opleveren.', 'Met zes tot acht uur per week en de juiste opbouw kom je verder dan met twaalf uur zonder richting.', 'Hoe haal ik het meeste uit weinig uren?'],
    ['Check je fietsmaten voor het seizoen.', 'Zadelhoogte en stand na de winter nog goed? Een kleine afwijking geeft over honderden kilometers klachten.', 'Hoe weet ik of mijn fiets goed is afgesteld?'],
    ['Vergelijk jezelf met vier weken geleden.', 'Per rit zie je weinig, per maand zie je alles. Kijk naar je trend, niet naar die ene slechte dag.', 'Hoe meet ik of ik vooruit ga?'],
    ['Een plateau is geen eindpunt.', 'Sta je stil, dan heeft je lichaam iets nieuws nodig: een andere prikkel, meer rust of een betere opbouw. Niet per se meer uren.', 'Hoe doorbreek ik een plateau?'],
    ['Combineer slim: drempel op dinsdag, lang in het weekend.', 'Zo heb je je zware training midweek en je duurrit in het weekend, met rust ertussen.', 'Hoe ziet een goede trainingsweek eruit?'],
    ['Rek na, niet ervoor.', 'Rustig rekken na je rit voelt fijn en houdt je soepel. Voor een training is inrijden beter dan rekken.', 'Moet ik rekken voor of na het fietsen?'],
    ['Een slechte dag zegt niks.', 'Iedereen heeft dagen dat de benen niet willen. Pas als het een week aanhoudt, is er iets om naar te kijken.', 'Wanneer moet ik me zorgen maken over slechte benen?'],
    ['Februari is kort, maak hem tellen.', 'Vier weken gericht trainen in februari geeft je een flinke voorsprong op iedereen die pas in maart begint.', 'Wat is een goede trainingsfocus voor deze maand?']
  ],
  3: [
    ['Bouw je uren rustig op.', 'Na de winter in een paar weken veel meer uren gaan rijden is vragen om overbelasting. Elke week een beetje meer.', 'Hoe bouw ik mijn uren op in het voorjaar?'],
    ['Check je fiets na de winter.', 'Remmen, ketting, banden en kabels. Wat in de winter stilstond of in de pekel reed, verdient even aandacht.', 'Wat moet ik nakijken aan mijn fiets na de winter?'],
    ['De eerste lange rit mag rustig.', 'Je eerste rit van vier uur hoeft niet snel. Wennen aan de duur is het doel.', 'Hoe rijd ik mijn eerste lange ritten van het jaar?'],
    ['Voorjaarsweer is verraderlijk.', 'Zon bij vertrek, hagel halverwege. Een windjack in je achterzak redt je rit.', 'Wat trek ik aan in het voorjaar?'],
    ['Wind tegen op de heenweg is een cadeau.', 'Start tegen de wind in, dan heb je hem mee als je moe bent. De windkaart in de app wijst je de richting.', 'Hoe plan ik mijn rit met de wind?'],
    ['Leer waaieren.', 'Bij zijwind schuif je schuin achter elkaar, zo dat je uit de wind zit. In een groep scheelt dat enorm veel energie.', 'Hoe rijd ik in een waaier?'],
    ['Rij met een groep die iets harder is.', 'Af en toe met sterkere renners mee leert je wiel houden, positie kiezen en dieper gaan dan je alleen zou doen.', 'Hoe leer ik beter rijden in een groep?'],
    ['In de groep: voorspelbaar rijden.', 'Geen plotselinge remacties, wijs gaten en obstakels aan, en houd je lijn. Dan rijdt iedereen veilig.', 'Wat zijn de regels voor rijden in een groep?'],
    ['Kopwerk doe je kort.', 'Liever vaak een korte beurt op kop dan één keer zo lang dat je daarna moet lossen.', 'Hoe lang moet ik op kop rijden?'],
    ['Een sterke wind is gratis kracht.', 'Een rit met harde wind tegen is een natuurlijke krachttraining. Houd je tempo rustig en je cadans hoog.', 'Hoe rijd ik slim met harde wind?'],
    ['Het voorjaar vraagt om laagjes.', 'Armstukken, beenstukken en een bodywarmer. Uit te trekken als de zon doorkomt, aan als het afkoelt.', 'Welke kleding is handig in het voorjaar?'],
    ['Je FTP is geen vast getal.', 'Hij beweegt mee met je vorm. Test elke zes tot acht weken opnieuw, anders train je op oude zones.', 'Hoe vaak moet ik mijn FTP testen?'],
    ['Klimmen is geduld.', 'Begin een lange klim rustiger dan je denkt en bouw op naar boven. Wie onderaan vol gaat, staat halverwege stil.', 'Hoe rijd ik een lange klim slim?'],
    ['Zware benen na een rustweek is normaal.', 'De eerste rit na een rustweek voelt vaak stroef. Geef het een dag, dan komt de pit terug.', 'Waarom voelen mijn benen zwaar na een rustweek?'],
    ['De man met de hamer is een voedingsfout.', 'Vrijwel altijd is het een lege tank, geen gebrek aan conditie. Genoeg koolhydraten onderweg voorkomt hem.', 'Hoe voorkom ik dat ik de man met de hamer tegenkom?'],
    ['Nieuwe banden? Eerst inrijden.', 'Een nieuwe band is de eerste kilometers glad. Neem bochten rustig tot het laagje eraf is.', 'Waar let ik op bij nieuwe banden?'],
    ['Check je banden voor elke rit.', 'De juiste spanning scheelt in comfort, grip en snelheid. En het kost je tien seconden.', 'Waarom maakt bandenspanning zoveel uit?'],
    ['Een slechte rit is ook informatie.', 'Leeg, moe of geen zin? Kijk wat je de dagen ervoor deed: slaap, eten, stress. Daar zit vaak het antwoord.', 'Waarom gaat een rit soms ineens slecht?'],
    ['Vooruit kijken in de groep.', 'Kijk niet naar het wiel voor je, maar een paar renners verder. Dan zie je remacties aankomen.', 'Hoe rijd ik veiliger in een groep?'],
    ['Een rustige week na drie zware.', 'Ook in het voorjaar, als het lekker gaat. Juist dan vergeet je het, en juist dan heb je hem nodig.', 'Wanneer plan ik een rustweek?'],
    ['Drinken in de wind valt tegen.', 'Bij wind en zon droog je sneller uit dan je merkt. Neem genoeg mee en drink regelmatig.', 'Hoeveel drink ik op een winderige rit?'],
    ['Hertest na een blok, niet midden in.', 'Na een rustweek zie je wat de training echt heeft gedaan. Midden in een zware periode test je je vermoeidheid.', 'Wanneer is het beste moment om te testen?'],
    ['Eerste buitenrit na de trainer: wennen aan sturen.', 'Na weken binnen is je balans en stuurwerk even roestig. Neem de eerste ritten bochten en verkeer rustig.', 'Waar let ik op als ik weer naar buiten ga?'],
    ['Zon in maart is nog geen warmte.', 'In de schaduw en op de afdaling koelt het snel af. Neem een extra laag mee.', 'Hoe kleed ik me op een zonnige maartdag?'],
    ['Lange duurritten bouwen je vetverbranding.', 'Rustige uren leren je lichaam zuinig om te gaan met brandstof. Dat merk je in het laatste uur van een tocht.', 'Waarom zijn lange rustige ritten zo waardevol?'],
    ['Pijn op de fiets is een signaal.', 'Knie, rug of nek die blijft zeuren, zit vaak in je houding of je zadel. Laat het checken in plaats van door te rijden.', 'Wat kan ik doen tegen pijn op de fiets?'],
    ['Een rondje met tempo erin.', 'Rij een bekende ronde en doe op een vast stuk een blok op tempo. Na een paar weken zie je je tijd zakken.', 'Hoe kan ik buiten mijn vooruitgang meten?'],
    ['Na een lange rit eerst eten, dan douchen.', 'De eerste tijd na een zware rit is je herstel het snelst. Een herstelshake of boterham staat binnen vijf minuten klaar.', 'Wat doe ik direct na een lange rit?'],
    ['Weet waar je kunt bijtanken.', 'Plan op lange ritten een tankstation of bakker in. Met een lege bidon halverwege is niemand sterk.', 'Hoe plan ik een lange rit?'],
    ['Maart is de maand van de eerste klassiekers.', 'Kijk eens hoe profs in de wind rijden en positie kiezen. Daar leer je meer van dan van welk filmpje ook.', 'Wat kan ik leren van de koers kijken?'],
    ['Geduld in maart, vorm in mei.', 'Wie in maart al vol gaat, is in mei op. Bouw rustig door, je beste weken komen nog.', 'Hoe plan ik mijn vorm over het seizoen?']
  ],
  4: [
    ['Kasseien rijd je met zachtere banden.', 'Een paar tienden minder druk geeft grip en comfort op kinderkopjes. De app rekent het uit als je kasseien kiest.', 'Welke spanning gebruik ik op kasseien?'],
    ['Op kasseien: grote versnelling, losse handen.', 'Houd het stuur bovenop vast maar ontspannen, en trap een iets zwaardere versnelling. Dan dans je eroverheen.', 'Hoe rijd ik over kasseien?'],
    ['April is regen en zon.', 'Een regenjack in de achterzak en spatborden op je trainingsfiets maken je ritten een stuk aangenamer.', 'Hoe ga ik om met regen op de fiets?'],
    ['Nat wegdek? Iets zachter pompen.', 'Een paar tienden minder druk geeft meer grip. En rem op tijd, niet in de bocht.', 'Hoe rijd ik veilig op nat wegdek?'],
    ['De langste rit is je generale repetitie.', 'Rijd hem op hetzelfde tempo, met dezelfde voeding en kleding als op je tocht.', 'Hoe lang moet mijn langste trainingsrit zijn?'],
    ['Op de grote dag probeer je niets nieuws.', 'Geen nieuwe gels, schoenen of zadel. Alles wat je die dag gebruikt, heb je getest op je lange ritten.', 'Hoe test ik mijn voeding en materiaal?'],
    ['Het eerste uur bepaalt je laatste uur.', 'Begin rustiger dan je denkt. Wat je vroeg te hard gaat, betaal je aan het eind dubbel terug.', 'Hoe deel ik mijn krachten in?'],
    ['Een klassieker rijd je ook in je hoofd.', 'Zware stroken, wind en vermoeidheid. Wie weet wat er komt en het accepteert, rijdt hem het beste uit.', 'Hoe bereid ik me mentaal voor op een zware tocht?'],
    ['Harder pompen is niet sneller.', 'Op echte wegen rolt een iets zachtere band vaak beter, omdat hij over oneffenheden heen rolt in plaats van te stuiteren.', 'Waarom is harder pompen niet altijd sneller?'],
    ['Een schone ketting is gratis snelheid.', 'Een vieze ketting kost watts en slijt je tandwielen. Even afnemen en smeren na een natte rit scheelt veel.', 'Hoe vaak moet ik mijn ketting schoonmaken?'],
    ['Eten op schema, niet op gevoel.', 'Zet een herinnering op je fietscomputer, bijvoorbeeld elk half uur. In de drukte van een tocht vergeet je het anders.', 'Hoeveel moet ik eten tijdens een tocht?'],
    ['Leg je spullen de avond ervoor klaar.', 'Kleding, voeding, nummer, banden gecheckt. Dan begin je de ochtend rustig in plaats van zoekend.', 'Wat neem ik mee naar een tocht?'],
    ['Plan je opbouw terug vanaf de datum.', 'Begin bij de dag zelf en reken terug: wanneer je langste rit, wanneer je rustweek, wanneer je afbouwt.', 'Hoe plan ik mijn opbouw naar mijn tocht?'],
    ['Steile korte klimmetjes: zittend waar het kan.', 'Zittend trap je zuiniger. Ga alleen staan op de steilste stukken of om even je benen te wisselen.', 'Wanneer klim ik staand en wanneer zittend?'],
    ['Lijn kiezen op een strook.', 'Op kasseien rijd je vaak het best over de kruin of juist langs de rand. Kijk vooruit en kies je lijn op tijd.', 'Hoe kies ik de beste lijn op kasseien?'],
    ['Wie veel zweet, verliest ook zout.', 'Op lange ritten helpt sportdrank meer dan alleen water, ook als het nog niet warm is.', 'Heb ik extra zout nodig?'],
    ['Een goede tocht begint met slapen.', 'De nacht voor een tocht slaap je vaak slecht van de spanning. Zorg dat je de nachten ervoor goed slaapt.', 'Wat als ik slecht slaap voor een tocht?'],
    ['Kijk de klassiekers met een doel.', 'Let op hoe renners eten, drinken en zich verstoppen in het peloton. Daar zit meer tactiek in dan je denkt.', 'Wat kan ik leren van de voorjaarsklassiekers?'],
    ['Vergeet je achterzak niet.', 'Reservebinnenband, bandenlichters, pompje of patroon, en een kleine multitool. Dan kom je altijd thuis.', 'Wat neem ik mee voor pech onderweg?'],
    ['Leer een band plakken voor je hem nodig hebt.', 'Oefen thuis een keer een binnenband wisselen. Langs de kant in de regen is geen goed moment om het te leren.', 'Hoe wissel ik snel een binnenband?'],
    ['Tubeless? Check je melk.', 'De afdichtmelk droogt in een paar maanden in. Even bijvullen voorkomt dat een klein gaatje je rit beëindigt.', 'Hoe onderhoud ik tubeless banden?'],
    ['Een rustige dag na een tocht.', 'Na een lange tocht is een rustdag of een half uur rustig draaien beter dan meteen weer hard.', 'Hoe herstel ik na een lange tocht?'],
    ['Pollen in de lucht? Ademen door je neus helpt niet.', 'Heb je last van hooikoorts, rijd dan liever na een regenbui of in de avond, als er minder pollen zijn.', 'Hoe train ik met hooikoorts?'],
    ['Vooruitgang voelt pas achteraf.', 'Midden in een zware periode voel je je vaak moe in plaats van sterk. Na een rustweek komt de beloning.', 'Waarom voel ik me moe terwijl ik goed train?'],
    ['Bochten: remmen voor de bocht.', 'Rem rechtop op het rechte stuk, laat los in de bocht en trap eruit. Remmen in de bocht kost grip.', 'Hoe neem ik bochten sneller en veiliger?'],
    ['Een lange rit in stukken knippen.', 'Denk niet aan honderd kilometer, maar aan het volgende stuk tot de bakker. Dat maakt een lange rit mentaal lichter.', 'Hoe houd ik een lange rit mentaal vol?'],
    ['Watt per kilo telt bergop, watts tellen op het vlakke.', 'Kijk wat jij wilt: snel bergop of hard op het vlakke. Je training en je focus verschillen.', 'Moet ik focussen op watts of op watt per kilo?'],
    ['Spatborden zijn geen schande.', 'Op je trainingsfiets houden ze jou en je maat erachter droog. In april een zegen.', 'Zijn spatborden handig op een racefiets?'],
    ['Na een regenrit: fiets droog, ketting gesmeerd.', 'Tien minuten na je rit voorkomt roest en een piepende ketting bij je volgende rit.', 'Wat doe ik met mijn fiets na een natte rit?'],
    ['Een strook van tevoren verkennen.', 'Rij het lastigste stuk van je tocht een keer van tevoren. Dan weet je waar het zwaar wordt en kun je je erop instellen.', 'Hoe verken ik het parcours van mijn tocht?'],
    ['April is de maand van de lange ritten.', 'Nu leg je de duur voor je zomertochten. Elke twee weken een lange rit, de rest rustig of gericht.', 'Hoe vaak rijd ik een lange rit?']
  ],
  5: [
    ['Mei is tochtenmaand.', 'Kies een toertocht en rijd hem op je eigen tempo. Een tocht met anderen is de leukste vorm van een lange training.', 'Welke tocht past bij mijn niveau?'],
    ['Een tocht van zes uur rijd je niet op karakter.', 'Je rijdt hem op tempo, voeding en een goede indeling. Karakter heb je nodig voor het laatste uur, niet voor de eerste vijf.', 'Hoe maak ik een plan voor mijn tocht?'],
    ['Ken je parcours.', 'Rijd een paar trainingen op vergelijkbaar terrein: lange klimmen, kasseien of gravel. Dan schrik je die dag nergens van.', 'Hoe bereid ik me voor op het parcours?'],
    ['De laatste week maakt je fris, niet fitter.', 'Minder uren, een paar korte prikkels en vooral goed slapen. Fitter word je in die week niet meer.', 'Wat doe ik in de week voor mijn tocht?'],
    ['Bergen in de zomer? Klim nu al.', 'Lange klimmen vragen een andere inspanning dan het vlakke. Zoek heuvels of doe lange blokken op tempo op de trainer.', 'Hoe bereid ik me in Nederland voor op de bergen?'],
    ['Een lange klim nabootsen.', 'Twintig tot veertig minuten op tempo, met een lage cadans, op de trainer of in de wind. Dat lijkt op een col.', 'Hoe train ik voor lange klimmen zonder bergen?'],
    ['Zonnebrand is ook materiaal.', 'Armen, nek en gezicht. Verbranden kost je herstel, en je huid onthoudt het.', 'Hoe bescherm ik me tegen de zon op de fiets?'],
    ['Een zonnebril is geen mode.', 'Hij beschermt je ogen tegen zon, wind, insecten en steentjes. Op de fiets een echte noodzaak.', 'Waarom is een fietsbril belangrijk?'],
    ['VO2max-werk is kort en pijnlijk, en het werkt.', 'Blokken van drie tot vijf minuten echt diep. Eén keer per week is voor de meeste renners genoeg.', 'Hoe train ik mijn VO2max?'],
    ['Langer volhouden is ook sneller.', 'Je drempel na drie uur rijden is wat telt in een lange tocht. Train dus ook je duurvermogen, niet alleen je piek.', 'Hoe train ik mijn uithoudingsvermogen?'],
    ['Een rustige dag is geen luie dag.', 'Hij hoort bij je training. Zonder rustige dagen kun je de zware niet goed doen.', 'Waarom zijn rustige dagen nodig?'],
    ['Rij eens zonder meter.', 'Een rit op gevoel, zonder te kijken naar snelheid of watts. Gewoon genieten van de weg.', 'Is het goed om soms zonder data te rijden?'],
    ['Je zwakke punt is je snelste winst.', 'Ben je sterk bergop maar zwak in de wind, of andersom? Daar zit de meeste vooruitgang voor de minste moeite.', 'Hoe vind ik mijn zwakke punt als renner?'],
    ['Gel of reep? Allebei.', 'Repen in het begin van een lange rit, gels als het zwaar wordt of tegen het eind. Dan blijft je maag rustig.', 'Wat eet ik wanneer op een lange rit?'],
    ['Twee bidons op een warme dag.', 'Een met water en een met sportdrank. Zo heb je vocht en brandstof, en kun je kiezen.', 'Wat doe ik in mijn bidons?'],
    ['Begin je tocht met een plan voor de stops.', 'Weet waar de verzorgingsposten zijn en wat je daar pakt. Zo sta je er niet te lang en vergeet je niks.', 'Hoe gebruik ik de bevoorrading slim?'],
    ['Na de tocht: herstel eerst, feest daarna.', 'Eerst drinken en iets eten met koolhydraten en eiwit. Dan heb je er morgen minder last van.', 'Wat eet ik direct na een tocht?'],
    ['Elke rit telt.', 'Een uurtje rustig is niet minder waard dan een lange tocht. Het gaat om wat je volhoudt.', 'Heeft een kort ritje wel zin?'],
    ['Een sterke romp maakt je laatste uur beter.', 'Als je romp moe wordt, zak je in en verlies je kracht. Core training houdt je stabiel tot de finish.', 'Waarom helpt core op lange ritten?'],
    ['Plan je zomervakantie met de fiets.', 'Een week bergen of een fietsvakantie is een mooi doel en een geweldige trainingsprikkel. Bouw ernaartoe.', 'Hoe bereid ik me voor op een fietsvakantie?'],
    ['Vergelijk je niet met Strava.', 'Je ziet alleen de beste ritten van anderen. Jouw enige echte tegenstander ben jij van vorige maand.', 'Hoe ga ik om met vergelijken op Strava?'],
    ['Een tempo-rit alleen is goud.', 'Een uur stevig doorrijden op je eigen tempo leert je pijn verdelen. Geen wiel om op te leunen.', 'Hoe train ik mijn tempo?'],
    ['Na een harde training: rustig uitrijden.', 'Tien minuten zacht trappen na je laatste blok helpt je benen herstellen.', 'Waarom is uitrijden belangrijk?'],
    ['Dalen leer je ontspannen.', 'Kijk ver vooruit, ontspan je armen en rem voor de bocht. Krampachtig dalen is gevaarlijker dan rustig dalen.', 'Hoe daal ik veiliger en sneller?'],
    ['Sprinten leer je fris.', 'Sprintwerk doe je aan het begin van je training, niet aan het eind met lege benen. Kwaliteit boven aantal.', 'Hoe train ik mijn sprint?'],
    ['Kies een doel, hoe klein ook.', 'Een rondje sneller, een nieuwe klim of een tocht met vrienden. Een doel geeft je ritten richting.', 'Welk doel past bij mij?'],
    ['Een hartslagband is preciezer dan je horloge.', 'Polsmeting kan afwijken, zeker bij intervallen. Voor je zones is een borstband betrouwbaarder.', 'Heb ik een hartslagband nodig?'],
    ['De beste training is de training die je doet.', 'Het perfecte schema helpt niet als je het niet volhoudt. Kies wat in je leven past.', 'Welke training past bij mijn week?'],
    ['Een buitenrit op tempo meet meer dan een test.', 'Rij elke maand dezelfde klim of ronde op tempo. Je tijd zegt veel over je vorm.', 'Hoe kan ik mijn vorm buiten meten?'],
    ['Lange dagen, vroeg op pad.', 'In mei is het al vroeg licht. Een rit voor je werk geeft je de rest van de dag de ruimte.', 'Hoe pas ik trainen in voor of na mijn werk?'],
    ['Geniet van wat je hebt opgebouwd.', 'Alle winteruren zie je nu terug. Rij een mooie route en voel hoe het gaat.', 'Hoe weet ik of mijn winter goed was?']
  ],
  6: [
    ['Hitte kost watts.', 'Bij warm weer ligt je vermogen lager bij dezelfde inspanning. Rijd op gevoel en hartslag, niet op je normale getallen.', 'Hoe train ik als het heel warm is?'],
    ['Rij vroeg als het heet wordt.', 'In de ochtend is het koeler en rijd je beter. En je hebt de rest van de dag nog.', 'Wat is het beste moment om te rijden in de zomer?'],
    ['Zout telt mee.', 'Als je veel zweet, verlies je ook zout. Op lange warme ritten helpt sportdrank meer dan alleen water.', 'Heb ik extra zout nodig als ik veel zweet?'],
    ['Drink al voor je vertrekt.', 'Begin een warme rit goed gehydrateerd. Een glas water extra bij je ontbijt helpt al.', 'Hoe begin ik goed aan een warme rit?'],
    ['Wennen aan warmte duurt een week of twee.', 'Je lichaam past zich aan. De eerste warme dagen voelen zwaar, daarna gaat het beter.', 'Hoe wen ik aan rijden in de warmte?'],
    ['Lichte kleding, open rits.', 'Een licht shirt en de rits open op een klim houden je koeler. Een witte helm is ook niet voor niets.', 'Wat trek ik aan als het warm is?'],
    ['Water over je hoofd koelt.', 'Op een hete klim helpt water over je nek en armen. Neem dan wel een extra bidon mee.', 'Hoe blijf ik koel op een hete rit?'],
    ['Na een warme rit: drinken met zout.', 'Alleen water is niet genoeg als je veel hebt gezweet. Een bouillon of sportdrank helpt je herstel.', 'Hoe herstel ik na een warme rit?'],
    ['Juni is de maand van de cols.', 'Plan je een bergreis? Doe nu je langste klimtrainingen, dan ben je in juli klaar.', 'Hoe bereid ik me voor op mijn bergweek?'],
    ['Een col rijd je op je eigen tempo.', 'Laat anderen gaan als ze te hard beginnen. Op een lange klim haal je ze vaak weer in.', 'Hoe rijd ik mijn eerste col?'],
    ['Compact verzet voor de bergen.', 'Een lichter verzet is geen zwakte. Liever soepel draaien dan elke col stampen.', 'Welke versnelling heb ik nodig in de bergen?'],
    ['Avondritten in de zomer.', 'Na het werk is het vaak nog licht en lekker. Een uurtje rustig of een tempo-rondje past bijna altijd.', 'Hoe train ik in de zomer naast mijn werk?'],
    ['Onweer? Niet gaan.', 'Op de fiets ben je in een onweersbui kwetsbaar. Check het weer en schuif je rit als het nodig is.', 'Wanneer kan ik beter niet rijden?'],
    ['Vliegjes en wespen: bril op, mond dicht.', 'Klinkt simpel, maar een wesp in je shirt op een afdaling is gevaarlijk. Blijf rustig en stop eerst.', 'Wat doe ik bij een insect op de fiets?'],
    ['Zomer is geen reden voor drie uur per dag.', 'Ook nu werkt opbouw en rust. Meer zon betekent niet automatisch meer uren.', 'Hoeveel train ik in de zomer?'],
    ['Een ijsje onderweg mag.', 'Op een lange zomerrit is een stop met iets lekkers ook brandstof. Geniet ervan.', 'Wat is goede brandstof onderweg?'],
    ['Hydrateer ook op rustdagen.', 'Bij warm weer verlies je de hele dag vocht. Goed drinken op rustdagen helpt je volgende rit.', 'Hoeveel drink ik op een warme rustdag?'],
    ['Een tempo-blok in de warmte: korter.', 'Doe kortere blokken of meer rust ertussen als het heet is. Kwaliteit boven aantal.', 'Pas ik mijn intervallen aan bij warmte?'],
    ['Hitte en hartslag.', 'Bij warmte ligt je hartslag hoger bij hetzelfde tempo. Dat is normaal, pas je tempo aan.', 'Waarom is mijn hartslag hoger bij warmte?'],
    ['Plan rustig voor je vakantie.', 'Wie vlak voor een bergweek nog hard traint, komt moe aan. Rij de week ervoor rustiger.', 'Wat doe ik in de week voor mijn fietsvakantie?'],
    ["Houd je motor draaiend in de zomer.","Blijf af en toe een lange rustige rit rijden. Dat houdt je duurvermogen op peil.","Hoe houd ik mijn duurvermogen vast in de zomer?"],
    ['Check je remmen voor de bergen.', 'Remblokken en kabels nakijken voor je de bergen in gaat. In een afdaling wil je daar niet aan twijfelen.', 'Wat check ik aan mijn fiets voor de bergen?'],
    ['Een groepsrit plannen?', 'Plan hem in de app en deel de link. Iedereen ziet het weer, de wind en zijn eigen spanning.', 'Hoe organiseer ik een goede groepsrit?'],
    ['Na een zware week een rustige.', 'Ook in de zomer heeft je lichaam rust nodig om sterker te worden.', 'Hoe plan ik rust in de zomer?'],
    ['Weinig tijd? Kort en stevig.', 'Een uur met een paar blokken op tempo houdt je fit, ook in een volle zomerweek.', 'Wat is een goede korte training?'],
    ['Een zwaar shirt is een nat shirt.', 'Synthetische kleding voert zweet af, katoen niet. Op de fiets altijd fietskleding.', 'Welke kleding is het beste in de zomer?'],
    ['Een lange klim: kleine stukjes.', 'Deel een col op in kilometerpaaltjes en denk alleen aan de volgende. Dan blijft de top haalbaar.', 'Hoe houd ik een lange klim mentaal vol?'],
    ['Train je dalen ook.', 'In de bergen verlies je op een afdaling makkelijk tijd en vertrouwen. Rustig oefenen op kleinere hellingen helpt.', 'Hoe oefen ik het dalen?'],
    ['Zomerse gewoonte: vroeg naar bed.', 'Lange lichte avonden verleiden tot laat opblijven. Maar goed slapen blijft je beste herstel.', 'Hoe slaap ik goed in de zomer?'],
    ['Een dag niet fietsen is ook goed.', 'Ook in een mooie maand. Je zin en je benen blijven er fris van.', 'Is het erg om een dag over te slaan?'],
    ['Halverwege het jaar: even terugkijken.', 'Wat ging goed, wat moet anders? Stel je plan bij voor de tweede helft van het seizoen.', 'Hoe evalueer ik halverwege het seizoen?']
  ],
  7: [
    ['Kijk de Tour met een doel.', 'Let op hoe renners eten, drinken en zich verstoppen in de groep. Je ziet in een etappe meer tactiek dan in een boek.', 'Wat kan ik leren van de Tour kijken?'],
    ['Profs rijden ook rustig.', 'Op een vlakke etappe rijdt het peloton urenlang rustig. Dat is precies hoe een goede duurrit eruitziet.', 'Waarom rijden profs zo vaak rustig?'],
    ['In de bergen eet je meer dan je denkt.', 'Een dag met drie cols kost veel brandstof. Eet elk half uur iets, ook als je geen honger hebt.', 'Hoeveel eet ik op een dag in de bergen?'],
    ['Afdalen: kijk waar je heen wilt.', 'Je fiets gaat waar je ogen kijken. Kijk naar het einde van de bocht, niet naar de vangrail.', 'Hoe neem ik haarspeldbochten?'],
    ['In de afdaling: windjack aan.', 'Na een warme klim koel je bergaf snel af. Een windjack voorkomt dat je verkleumd beneden komt.', 'Wat trek ik aan voor een afdaling?'],
    ['Hoogte voel je.', 'Boven de 2000 meter is de lucht ijler en voelt alles zwaarder. Rij daar rustiger dan je gewend bent.', 'Hoe rijd ik op grote hoogte?'],
    ['Een bergweek is geen wedstrijd.', 'Rij elke dag op je eigen tempo, dan geniet je alle dagen in plaats van alleen de eerste.', 'Hoe verdeel ik mijn krachten over een bergweek?'],
    ['Vakantie zonder fiets is ook goed.', 'Een week niet fietsen kost je weinig conditie en geeft je hoofd rust. Je komt fris terug.', 'Verlies ik veel als ik een week niet fiets?'],
    ['Na je vakantie rustig weer op.', 'Begin met een paar rustige ritten voor je weer zware trainingen doet.', 'Hoe pak ik de draad op na mijn vakantie?'],
    ["Warmte vraagt een lager tempo.","Bij dertig graden kost hetzelfde tempo veel meer moeite. Rijd op gevoel en accepteer dat het langzamer gaat.","Hoe pas ik mijn tempo aan bij hitte?"],
    ['Drink op schema in de hitte.', 'Elk kwartier een paar slokken, ook zonder dorst. Bij hitte heb je vaak meer dan een bidon per uur nodig.', 'Hoeveel drink ik bij hitte?'],
    ['Weet waar je water kunt halen.', 'Fonteinen, kerkhoven, tankstations. Op een hete dag in de bergen een levensredder.', 'Hoe plan ik waterstops op een lange rit?'],
    ["Een fietspetje onder je helm.","Het beschermt je hoofd tegen de zon en houdt zweet uit je ogen.","Hoe bescherm ik mijn hoofd in de zon?"],
    ['Huur je een fiets op vakantie?', 'Neem je eigen pedalen, zadel en een meetlint mee. Met jouw maten voelt een huurfiets als die van jou.', 'Waar let ik op bij een huurfiets?'],
    ['Neem je fiets mee? Pak hem goed in.', 'Een fietskoffer of goede doos, pedalen eraf, derailleur beschermd. Dan begint je vakantie niet bij de fietsenmaker.', 'Hoe neem ik mijn fiets mee op reis?'],
    ['Een col voelt beter met een plan.', 'Zoek van tevoren de lengte en de steilste stukken op. Dan weet je wanneer je moet sparen.', 'Hoe bereid ik me voor op een col?'],
    ["Op een col: kijk niet naar de top.","Kijk een paar meter voor je en rijd je eigen ritme. De top komt vanzelf.","Hoe blijf ik rustig op een lange klim?"],
    ['Staan om je benen te wisselen.', 'Op een lange klim even uit het zadel geeft andere spieren werk. Dan houd je het langer vol.', 'Wanneer ga ik staan op een klim?'],
    ['Een sterke romp helpt bergop.', 'Als je romp stabiel is, gaat je kracht naar de pedalen in plaats van naar het wiebelen. Juist op een lange klim.', 'Waarom helpt core bij klimmen?'],
    ['Na een bergdag: veel eten.', 'Koolhydraten en eiwit na een zware dag, zodat je morgen weer kunt.', 'Wat eet ik na een zware bergdag?'],
    ['Slaap in de warmte.', 'Een koele kamer en een glas water naast je bed. Slecht slapen in de hitte kost je de volgende dag.', 'Hoe slaap ik goed als het warm is?'],
    ['Een rondje om de kerktoren telt ook.', 'Niet iedereen gaat naar de bergen. Een gewone zomer thuis is ideaal om consistent te trainen.', 'Hoe train ik goed in een zomer thuis?'],
    ['Lange ritten vroeg in de ochtend.', 'Vertrek om zeven uur en je bent thuis voor de warmste uren. Dat is slim trainen in juli.', 'Wanneer rijd ik mijn lange ritten in de zomer?'],
    ["Een tijdritje voor jezelf.","Kies een vlak stuk van tien kilometer en rij het op tempo. Elke maand opnieuw laat zien hoe je vooruitgaat.","Hoe meet ik mijn vooruitgang buiten?"],
    ['Een slechte dag in de bergen kan.', 'Hoogte, hitte en vermoeidheid stapelen op. Neem het rustig, morgen is er weer een dag.', 'Wat doe ik als ik een slechte dag heb op vakantie?'],
    ['Tijdens de koers kijken: let op de bidons.', 'Renners pakken constant drinken en eten. Neem het over: ook jij hebt elk uur brandstof nodig.', 'Hoe weet ik of ik genoeg eet en drink?'],
    ['Regen in de bergen is koud.', 'Een regenjack en lange handschoenen in je tas, ook in juli. Boven op een col kan het ineens fris zijn.', 'Wat neem ik mee voor slecht weer in de bergen?'],
    ['Check je banden na een bergweek.', 'Remmen op lange afdalingen en scherpe steentjes slijten je banden. Kijk ze even na.', 'Wanneer moet ik mijn banden vervangen?'],
    ['Een herstelrit is echt herstel.', 'Een half uur tot een uur op zacht tempo. Gaat het vanzelf harder, dan is het geen herstel meer.', 'Hoe rijd ik een goede herstelrit?'],
    ['Plezier houdt je op de fiets.', 'Rij eens een nieuwe route, of plan een rit met vrienden via de groepsrit in de app.', 'Hoe houd ik het leuk?'],
    ['Na de Tour: kies je najaarsdoel.', 'Een najaarstocht of gravelrit geeft de tweede helft van het seizoen richting.', 'Welk doel kies ik voor het najaar?']
  ],
  8: [
    ['Augustus is genieten van je vorm.', 'Je hebt een seizoen in de benen. Rij mooie ritten, lange tochten en geniet ervan.', 'Hoe houd ik mijn vorm vast in de zomer?'],
    ['Een vakantieweek is een trainingsprikkel.', 'Na een week met veel fietsen heb je rust nodig. Plan daarna een rustige week.', 'Hoe herstel ik na een fietsvakantie?'],
    ['Drukke zomer? Kort en gericht.', 'Met kinderen thuis of drukte op het werk: een uur met een duidelijk doel houdt je fit.', 'Hoe train ik in een drukke zomer?'],
    ['Een rondje sneller dan vorig jaar.', 'Rij een ronde of klim die je al kent op tempo. Vergelijk met vorig jaar en zie hoe ver je bent gekomen.', 'Hoe zie ik mijn vooruitgang over een jaar?'],
    ['Zomerse buien zijn heftig.', 'Een plotselinge bui maakt de weg glad en het zicht slecht. Rustig aan en extra afstand houden.', 'Hoe rijd ik veilig in een zomerbui?'],
    ["Na een hete rit: eerst afkoelen.","Eerst drinken en schaduw opzoeken, dan pas douchen. Je lichaam heeft even nodig om tot rust te komen.","Hoe herstel ik na een hete rit?"],
    ["IJsblokjes in je bidon.","Een bidon met ijs blijft langer koel en drinkt veel lekkerder op een warme dag.","Hoe houd ik mijn drinken koel?"],
    ['Een lange rit plannen: met lunchstop.', 'Halverwege een goede stop met eten en drinken maakt een lange zomerrit een feest in plaats van een strijd.', 'Hoe plan ik een lange zomerrit?'],
    ['Rij eens een gravelroute.', 'Onverharde paden zijn een mooie afwisseling en een goede techniektraining. Wel zachtere banden.', 'Hoe begin ik met gravelrijden?'],
    ['Op gravel: zachter pompen.', 'Op onverhard rijd je met een stuk minder druk dan op de weg. Meer grip, minder stuiteren.', 'Welke spanning gebruik ik op gravel?'],
    ['Losse ondergrond: blijf zitten.', 'Op een losse klim houd je meer grip als je blijft zitten en rond trapt.', 'Hoe klim ik op losse ondergrond?'],
    ['Ontspannen handen op gravel.', 'Stevig vasthouden maar niet knijpen. Je fiets mag onder je bewegen.', 'Hoe houd ik controle op gravel?'],
    ['Kijk terug op je zomer.', 'Hoeveel uren, welke ritten, wat ging goed? Daar haal je je plan voor het najaar uit.', 'Hoe evalueer ik mijn zomer?'],
    ['Een tempo-blok op een warme dag: korter.', 'Doe kortere blokken of meer rust ertussen als het heet is.', 'Pas ik mijn intervallen aan bij warmte?'],
    ["Rust is geen achteruitgang.","Een paar dagen niet fietsen in een drukke week kost je bijna niks. Je komt fris terug.","Verlies ik conditie als ik een paar dagen niet fiets?"],
    ['Na de vakantie: hertest.', 'Een paar weken na je vakantie zie je met een test of analyse waar je staat voor het najaar.', 'Wanneer test ik na de zomer?'],
    ['Een fietsvriend is goud.', 'Samen trainen houdt je eerlijk en gemotiveerd. Plan elke week een vaste rit samen.', 'Hoe vind ik iemand om mee te trainen?'],
    ['Leer een bidon pakken.', 'In de groep een bidon uit je houder pakken zonder te slingeren. Oefen het op een rustig stuk.', 'Hoe drink ik veilig in de groep?'],
    ["Een reep in je achterzak, altijd.","Ook op een korte rit. Een hongerklop op tien kilometer van huis is nergens voor nodig.","Wat neem ik altijd mee op de fiets?"],
    ['Bandenspanning en warmte.', 'Een fiets in de zon warmt je banden op. Pomp in de schaduw en check voor vertrek.', 'Beïnvloedt warmte mijn bandenspanning?'],
    ['Een volle agenda vraagt een vast moment.', 'Zet je training als afspraak in je agenda. Dan schuift hij niet steeds naar morgen.', 'Hoe maak ik tijd voor trainen?'],
    ['Avondritten met verlichting.', 'Eind augustus worden de avonden korter. Een achterlicht mag nu weer mee.', 'Welke verlichting heb ik nodig?'],
    ['Combineer: rustig met een stuk tempo.', 'Een duurrit met halverwege twintig minuten tempo is een prima training als je weinig tijd hebt.', 'Hoe maak ik een duurrit nuttiger?'],
    ['Een plateau na de zomer is normaal.', 'Na een paar maanden trainen stagneer je soms. Een nieuwe prikkel of een rustweek helpt je verder.', 'Hoe doorbreek ik een plateau?'],
    ['Vergeet je core niet in de zomer.', 'Juist als je veel fietst, houdt een sterke romp je houding goed en je rug blij.', 'Hoe combineer ik core en veel fietsen?'],
    ['Eet groente bij je pasta.', 'Koolhydraten zijn je brandstof, maar groente en fruit zorgen voor je herstel en weerstand.', 'Wat is een goede maaltijd voor wielrenners?'],
    ['Een sportief weekend? Plan de rust erna.', 'Twee lange ritten achter elkaar is mooi, maar plan dan maandag een rustige dag.', 'Hoe plan ik een zwaar weekend?'],
    ['Een goede bril voor elk licht.', 'Een lichte lens voor bewolkte dagen en schemer, een donkere voor de zon.', 'Welke lens past bij welk weer?'],
    ['Wespentijd: let op je bidon.', 'In augustus houden wespen van je sportdrank. Kijk even voor je drinkt.', 'Hoe voorkom ik problemen met wespen?'],
    ['Kies je doel voor het najaar.', 'Een najaarstocht of een FTP-doel voor de winter. Dan blijf je gemotiveerd als het seizoen afloopt.', 'Welk doel kies ik voor het najaar?'],
    ['Geniet van de lange dagen.', 'Over een paar weken wordt het donker en koud. Pak nu de mooie ritten mee.', 'Hoe haal ik het meeste uit de zomer?']
  ],
  9: [
    ['September is terug naar het ritme.', 'Na de zomer helpt een vaste trainingsweek om weer in je ritme te komen.', 'Hoe kom ik weer in een goed trainingsritme?'],
    ['Kijk terug voor je vooruit kijkt.', 'Wat ging goed dit jaar, wat niet? Daar haal je je plan voor volgend jaar uit.', 'Hoe evalueer ik mijn seizoen?'],
    ['Een najaarstocht is een mooi slot.', 'De herfstkleuren en koelere temperaturen maken een lange tocht extra mooi.', 'Hoe bereid ik me voor op een najaarstocht?'],
    ['Gravel is de herfstsport.', 'Onverharde paden, minder verkeer, door het bos. Een mooie manier om je seizoen te verlengen.', 'Hoe begin ik met gravelrijden?'],
    ["Gravel vraagt brede banden.","Op onverhard rijden bredere banden comfortabeler en met meer grip. Kijk wat er in je frame past.","Welke banden heb ik nodig voor gravel?"],
    ['Een frisse ochtend vraagt laagjes.', 'September begint koel en wordt warm. Armstukken en een bodywarmer zijn ideaal.', 'Wat trek ik aan in september?'],
    ['Test na een rustige zomer.', 'Een test of analyse in september laat zien waar je staat en waar je winterplan op moet bouwen.', 'Wanneer test ik na de zomer?'],
    ['Leer van je beste rit.', 'Wat was je beste rit dit jaar en waarom? Goed geslapen, goed gegeten, rustig begonnen? Neem het mee.', 'Wat maakt een goede rit?'],
    ['Een rustweek na je laatste tocht.', 'Na je laatste grote tocht verdient je lichaam een rustige week.', 'Hoe herstel ik na mijn laatste tocht?'],
    ['De dagen worden korter, plan vooruit.', 'Ritten voor of na het werk worden lastiger. Kijk wanneer het licht is en plan je week daarop.', 'Hoe plan ik trainen als het eerder donker wordt?'],
    ['Verlichting aan, ook overdag.', 'Als de dagen korter worden, word je slechter gezien. Een goed achterlicht overdag is geen overbodige luxe.', 'Welke verlichting heb ik nodig?'],
    ["Drie keer tien minuten tempo.","In een rit van anderhalf uur. Simpel, effectief, en het past in een avond na je werk.","Wat is een goede training voor na het werk?"],
    ["Na een gravelrit: fiets schoon.","Stof en modder slijpen je ketting en remmen. Even afspoelen en smeren na een rit door het bos.","Hoe onderhoud ik mijn gravelfiets?"],
    ['Begin met kracht in het najaar.', 'Twee korte sessies per week leggen de basis voor een sterke winter.', 'Welke krachtoefeningen helpen mij op de fiets?'],
    ['Een sterke romp is je winterbasis.', 'Wie nu met core begint, rijdt in het voorjaar stabieler en met minder rugpijn.', 'Waarom begin ik nu met core?'],
    ['Motivatie na het seizoen.', 'Geen doel meer in zicht? Kies een klein doel voor de winter, zoals een FTP-getal of een aantal Core-weken.', 'Hoe blijf ik gemotiveerd na het seizoen?'],
    ['Herfstwind is sterk.', 'Plan je rit met de wind: tegen op de heenweg, mee terug.', 'Hoe plan ik mijn rit met de wind?'],
    ["Laagstaande zon verblindt.","Jou en de automobilist achter je. Een goede bril, en extra opletten bij het afslaan.","Hoe rijd ik veilig met een laagstaande zon?"],
    ['Eet seizoensgroente.', 'Pompoen, kool, wortels: goedkoop, voedzaam en goed voor je weerstand nu het kouder wordt.', 'Wat eet ik in het najaar voor een goede weerstand?'],
    ['Weerstand begint met slaap.', 'Nu de verkoudheden rondgaan, helpt goed slapen je gezond te blijven.', 'Hoe blijf ik gezond in het najaar?'],
    ["Druk op het werk na de vakantie?","Pak het rustig op. Liever twee goede trainingen per week dan vier gehaaste.","Hoe combineer ik werk en training na de zomer?"],
    ['Plan je winter nu.', 'Wat wil je in het voorjaar kunnen? Reken terug en maak een plan voor de wintermaanden.', 'Hoe maak ik een winterplan?'],
    ['Een trainer klaarzetten voor de winter.', 'Check je trainer, je app en je ventilator nu, dan begin je in oktober zonder gedoe.', 'Wat heb ik nodig om binnen te trainen?'],
    ['Een goede herfstrit: rustig en lang.', 'Het najaar is ideaal voor lange rustige ritten door mooie natuur.', 'Hoe hard rijd ik in het najaar?'],
    ['Leer van je slechtste rit.', 'Wat ging er mis? Te snel begonnen, te weinig gegeten? Je slechtste rit leert je vaak het meest.', 'Wat kan ik leren van een slechte rit?'],
    ['Veldrijden is ook trainen.', 'Wie het najaar wil opleuken: een rondje door het bos of een veldritje is een geweldige techniekles.', 'Is veldrijden een goede training?'],
    ['Na een natte rit: schoenen drogen.', 'Krantenpapier in je schoenen en niet op de verwarming. Dan zijn ze morgen weer droog en blijven ze heel.', 'Hoe droog ik natte fietsschoenen?'],
    ["Het beste schema past bij je leven.","Een plan dat je volhoudt, wint van een perfect plan dat je na twee weken loslaat.","Welk schema past bij mijn week?"],
    ['Een rondje zonder doel.', 'Na een seizoen vol doelen is een rit op gevoel, gewoon voor de lol, goed voor je hoofd.', 'Is het goed om soms zonder plan te rijden?'],
    ['Vergelijk jezelf met vorig jaar.', 'Kijk naar september vorig jaar. Grote kans dat je nu verder bent dan je denkt.', 'Hoe zie ik mijn vooruitgang?'],
    ['Een nieuw seizoen begint in je hoofd.', 'Wat wil je volgend jaar? Een tocht, een tijd, een gevoel? Schrijf het op.', 'Hoe kies ik een doel voor volgend jaar?']
  ],
  10: [
    ['Na je seizoen even echt rust.', 'Een of twee weken rustig of iets anders doen laat je lichaam en hoofd herstellen. Daarna begin je fris aan de winter.', 'Hoeveel rust neem ik na mijn seizoen?'],
    ['Natte bladeren zijn ijs.', 'In bochten met blad op de weg remt en stuurt je fiets anders. Rustig aan, en niet hard remmen in de bocht.', 'Hoe rijd ik veilig in de herfst?'],
    ["Knipperlicht achter, vast licht voor.","Zo word je in de schemer goed gezien en zie je zelf de weg.","Welke lampen zijn goed voor op de fiets?"],
    ["Je seizoen in drie getallen.","Aantal ritten, je langste rit en je beste twintig minuten. Schrijf ze op en vergelijk volgend jaar.","Hoe houd ik mijn seizoen bij?"],
    ['Oktober is de start van je winter.', 'Wie nu een plan heeft, staat in maart een stap voor. Begin rustig met basis en kracht.', 'Hoe begin ik aan mijn wintertraining?'],
    ['Binnen trainen: begin rustig.', 'Je eerste weken op de trainer hoeven niet zwaar. Wennen aan binnen rijden is genoeg.', 'Hoe begin ik met indoor trainen?'],
    ['Een ventilator is geen luxe.', 'Op de trainer heb je geen rijwind. Zonder ventilator oververhit je en wordt elke training zwaarder.', 'Hoe maak ik binnen trainen prettiger?'],
    ['Herfstkleding: winddicht voorop.', 'Een jack dat voorop winddicht is en achterop ademt, houdt je warm zonder dat je kookt.', 'Wat trek ik aan in de herfst?'],
    ['Overschoenen voor je tenen.', 'Koude voeten bederven een rit. Overschoenen zijn vanaf oktober je beste vriend.', 'Hoe houd ik mijn voeten warm?'],
    ['Krachttraining in oktober.', 'Nu je minder fietst, is er ruimte voor kracht. Twee keer per week maakt je in het voorjaar sterker.', 'Welke krachtoefeningen helpen mij op de fiets?'],
    ["Lunges maken je benen stabiel.","Een been tegelijk traint je balans en kracht, net als trappen. Begin met je eigen gewicht.","Hoe doe ik een goede lunge?"],
    ["Minder uren, toch goed eten.","Minder fietsen betekent niet dat je ineens weinig moet eten. Je trainingen hebben nog steeds brandstof nodig.","Hoeveel eet ik in het najaar?"],
    ['Een donkere ochtend? Rij binnen.', 'In het donker en de regen is binnen trainen vaak slimmer en veiliger.', 'Wanneer train ik binnen en wanneer buiten?'],
    ['Een winterplan in drie blokken.', 'Eerst basis en kracht, dan drempel, dan richting het voorjaar. Elk blok een paar weken met een rustweek.', 'Hoe ziet een goed winterplan eruit?'],
    ['Een test aan het begin van de winter.', 'Een FTP-test of analyse geeft je een startpunt. In maart zie je wat de winter heeft opgeleverd.', 'Wanneer test ik in de winter?'],
    ['Vergeet je fiets niet.', 'Na het seizoen een onderhoudsbeurt: ketting, cassette, kabels en remblokken. Dan is hij klaar voor de winter.', 'Wat laat ik nakijken na het seizoen?'],
    ['Een winterfiets spaart je mooie fiets.', 'Pekel en vuil zijn slecht voor dure onderdelen. Een eenvoudige winterfiets met spatborden is slim.', 'Heb ik een winterfiets nodig?'],
    ["Kies je route op beschutting.","Bij harde herfstwind is een route langs bossen en bebouwing een stuk aangenamer.","Hoe plan ik een route bij harde wind?"],
    ['Eet genoeg, ook in de winter.', 'Minder uren betekent iets minder eten, maar niet zo weinig dat je trainingen slecht gaan.', 'Hoeveel eet ik in de winter?'],
    ["Handen wassen na een groepsrit.","In het verkoudheidsseizoen scheelt het je zomaar een week op bed. Simpel en effectief.","Hoe voorkom ik dat ik ziek word?"],
    ["Twijfel je? Rij rustig en kort.","Voel je je net niet lekker, rij dan een kort rustig rondje. Gaat het slechter, stop dan.","Wanneer kan ik beter niet trainen?"],
    ["Elke training heeft een reden.","Weet waarom je een training doet: herstel, basis of drempel. Dan rijd je hem in het juiste tempo.","Wat is het doel van mijn training?"],
    ['Combineer binnen en buiten.', 'Doordeweeks gericht op de trainer, in het weekend lang en rustig buiten. Het beste van twee werelden.', 'Hoe combineer ik binnen en buiten trainen?'],
    ["Even rekken na je bureaudag.","Een paar minuten je borst, heupen en hamstrings rekken na een dag zitten scheelt in je houding op de fiets.","Welke rekoefeningen doe ik na een dag zitten?"],
    ['Een donkere avond is goed voor je core.', 'Tien minuten core terwijl het buiten regent. Geen excuus nodig.', 'Hoe pas ik core in mijn week?'],
    ["Een paar dagen niks? Morgen weer.","Een paar dagen niet gefietst door regen of drukte maakt niks uit. Pak gewoon de draad weer op.","Hoe pak ik de draad weer op?"],
    ['Veldrijden kijken leert sturen.', 'Kijk hoe crossers hun fiets door modder en bochten sturen. Daar kun je op gravel veel van leren.', 'Wat kan ik leren van veldrijden?'],
    ['Een rustige rit in de herfstzon.', 'Op een mooie oktoberdag rustig door de bossen. Ook dat is training.', 'Hoe hard rijd ik in het najaar?'],
    ['Schrijf je doel voor volgend jaar op.', 'Met een doel op papier krijgt je winter richting.', 'Hoe kies ik een doel voor volgend jaar?'],
    ['Een gewoonte bouwen: vaste dagen.', 'Train op vaste dagen, dan wordt het een gewoonte in plaats van een keuze.', 'Hoe maak ik trainen een gewoonte?'],
    ['Geduld in de winter, vorm in het voorjaar.', 'Wie nu rustig en consequent werkt, plukt in het voorjaar de vruchten.', 'Hoe plan ik mijn vorm over het jaar?']
  ],
  11: [
    ['November is basismaand.', 'Rustige uren, kracht en core. Niet spannend, wel de basis voor alles wat komt.', 'Wat train ik in november?'],
    ["Op de trainer: kies vooraf je doel.","Weet of het een rustige, een drempel- of een cadanstraining wordt. Zonder doel wordt het trappen tot de film af is.","Hoe kies ik een indoortraining?"],
    ["Een handdoek over je stuur.","Zweet op je stuur en frame vreet aan je fiets. Een handdoek en een zweetnet zijn goedkope bescherming.","Hoe bescherm ik mijn fiets op de trainer?"],
    ["Laagjes in plaats van één dikke jas.","Een goed ondershirt, een shirt met lange mouwen en een winddicht jack. Zo kun je onderweg bijregelen.","Hoe kleed ik me in laagjes?"],
    ["Warme vingers beginnen bij een warme romp.","Is je lijf koud, dan stuurt je lichaam minder warmte naar je handen. Een warm lijf geeft warme vingers.","Waarom heb ik altijd koude handen?"],
    ["Check je ventiel in de kou.","Rubber wordt stug als het koud is. Zit je ventiel goed dicht, dan loop je niet langzaam leeg.","Waarom loopt mijn band in de winter langzaam leeg?"],
    ["Een thermosbidon voor lange winterritten.","Warme thee of sportdrank in een geïsoleerde bidon drinkt veel prettiger dan ijskoud water.","Wat drink ik op een koude rit?"],
    ["Strooizout is slecht voor je fiets.","Na een rit over gestrooide wegen: afspoelen met lauw water en de ketting smeren.","Hoe bescherm ik mijn fiets tegen strooizout?"],
    ["Een goede squat merk je bergop.","Hij traint precies de spieren die je op een klim gebruikt. Rustig opbouwen, techniek eerst.","Hoe doe ik een goede squat?"],
    ['Drie keer kort wint van één keer lang.', 'Drie keer per week tien minuten core maakt je sterker dan één keer een half uur.', 'Hoe vaak moet ik core trainen?'],
    ["Kies een winterdoel.","Een FTP-getal, een aantal trainingen of tien weken Core. Een doel maakt van de winter een project.","Welk winterdoel past bij mij?"],
    ["Op de trainer drink je meer dan buiten.","Zonder rijwind zweet je veel meer. Twee bidons voor een uur binnen is geen uitzondering.","Hoeveel drink ik op de trainer?"],
    ["Rustige trainer-ritten mogen saai zijn.","Een serie of podcast erbij en gewoon rustig trappen. Niet elke training hoeft spannend te zijn.","Hoe houd ik een rustige indoorrit vol?"],
    ["Je vermogen binnen en buiten verschilt.","Op de trainer trap je vaak iets minder dan buiten. Dat is normaal. Test binnen voor je binnenzones.","Waarom is mijn vermogen binnen lager?"],
    ['Een rustweek na drie weken opbouwen.', 'Ook in de winter. Daarna ga je er sterker uit.', 'Waarom zijn rustweken zo belangrijk?'],
    ['Lange winterritten: eet ook.', 'In de kou verbrand je extra. Neem genoeg eten mee, ook op een rustige rit.', 'Hoeveel eet ik op een winterrit?'],
    ["Een droge rit is een fijne rit.","Overschoenen, een regenjack en spatborden maken van een natte novemberdag een prima trainingsdag.","Wat heb ik nodig om in de regen te rijden?"],
    ['Een winterjas met ventilatie.', 'Ritsen onder je armen of op je rug laten zweet weg. Dan blijf je warm en droog.', 'Welke winterjas past bij mij?'],
    ['Een muts onder je helm.', 'Een dun mutsje onder je helm houdt je hoofd en oren warm zonder dat je helm niet past.', 'Hoe houd ik mijn hoofd warm?'],
    ['Een lampje op je helm.', 'In de donkere maanden word je beter gezien met een extra lampje hoog op je helm.', 'Hoe word ik beter gezien in het donker?'],
    ["Daglicht helpt je slaap.","Ga in de donkere maanden overdag even naar buiten. Licht helpt je ritme en je nachtrust.","Hoe slaap ik beter in de winter?"],
    ["Houd een trainingslog bij.","Een korte notitie na elke training: hoe voelde het? Na een paar weken zie je patronen.","Hoe houd ik een trainingslog bij?"],
    ["Eenbenig trappen maakt je soepel.","Op de trainer even met één been trappen leert je rond trappen. Kort en rustig, dan wisselen.","Wat is eenbenig trappen?"],
    ['Een kort blok op tempo houdt je scherp.', 'Ook in de basisperiode helpt af en toe een blok op tempo om je motor wakker te houden.', 'Mag ik in de winter ook hard trainen?'],
    ['Rugpijn op de fiets zit vaak in je romp.', 'Een vermoeide romp laat je rug het werk doen. Core helpt, maar laat aanhoudende pijn checken.', 'Kan core helpen tegen rugpijn?'],
    ["Laat je trainer klaarstaan.","Een trainer die altijd klaarstaat, gebruik je veel vaker dan een die je eerst moet opzetten.","Hoe maak ik binnen trainen makkelijker?"],
    ["Een week ziek? Bouw rustig weer op.","Na een griep begin je met rustige ritten. Je conditie komt sneller terug dan je denkt.","Hoe bouw ik weer op na ziekte?"],
    ['Een virtuele groepsrit.', 'Op de trainer samen rijden met anderen maakt een winteravond een stuk leuker.', 'Hoe maak ik indoor trainen leuker?'],
    ['Eet genoeg eiwit.', 'Zeker als je aan kracht werkt, helpt eiwit bij elke maaltijd je spieren herstellen.', 'Hoeveel eiwit heb ik nodig?'],
    ["Kleine stappen, grote winst.","Elke week iets beter dan de vorige: een training meer, een sessie Core extra. Het stapelt op.","Hoe bouw ik geleidelijk op?"],
    ['Een maand basis zit erop.', 'Kijk terug op je november: hoeveel trainingen, hoeveel core? Elke week telt.', 'Hoe houd ik mijn voortgang bij?']
  ],
  12: [
    ['December: feestdagen en fietsen kan samen.', 'Een rit in de ochtend en daarna gezellig aan tafel. Je hoeft niet te kiezen.', 'Hoe combineer ik de feestdagen met trainen?'],
    ['Een vrije week is een kans.', 'Rond de feestdagen heb je vaak tijd. Een paar extra rustige uren leggen een mooie basis.', 'Hoe gebruik ik de vrije dagen?'],
    ['Feest is ook goed.', 'Een paar avonden lekker eten maakt niks kapot. Het gaat om wat je het hele jaar doet.', 'Hoe ga ik om met eten tijdens de feestdagen?'],
    ['Kijk terug op je jaar.', 'Hoeveel uren, welke tochten, wat ging goed? Je bent vaak verder gekomen dan je denkt.', 'Hoe evalueer ik mijn jaar?'],
    ["Wat ging dit jaar het best?","Kijk naar je mooiste rit of je grootste vooruitgang. Daar zit vaak de sleutel voor volgend jaar.","Wat neem ik mee naar volgend jaar?"],
    ['Een rustige week rond de kerst.', 'Na een paar maanden opbouwen is een rustige week rond de feestdagen een mooi moment.', 'Wanneer plan ik een rustweek?'],
    ['Een winterrit met vrienden.', 'Een tocht tussen kerst en oud en nieuw, met koffie onderweg. Een mooie traditie.', 'Hoe organiseer ik een groepsrit?'],
    ["Een winterzonnetje is bedrieglijk.","In de zon voelt het warm, in de schaduw en bergaf is het koud. Kleed je op de koudste stukken.","Hoe kleed ik me op een zonnige winterdag?"],
    ["Mist? Licht aan en extra opletten.","In de mist word je slecht gezien. Fel achterlicht, voorlicht aan en kies rustige wegen.","Hoe rijd ik veilig in de mist?"],
    ["Loop je banden na op sneetjes.","In de winter rijd je over meer gruis. Even je banden nalopen voorkomt een lekke band in de kou.","Hoe controleer ik mijn banden?"],
    ["Core in de feestweek: tien minuten.","Ook tussen de feestdagen past een korte sessie. Je reeks blijft staan en je voelt je beter.","Hoe houd ik mijn core vol in drukke weken?"],
    ['Een cadeau voor jezelf: goede winterkleding.', 'Warme handschoenen of overschoenen maken elke winterrit beter.', 'Welke winterkleding is het meest de moeite waard?'],
    ["Iets warms na een koude rit.","Warme chocomel of thee na je winterrit warmt op en zet je herstel in gang.","Wat doe ik na een koude rit?"],
    ['Slaap in de donkere dagen.', 'Lange avonden zijn ideaal om op tijd naar bed te gaan. Je herstel zal je dankbaar zijn.', 'Hoeveel invloed heeft slaap op mijn herstel?'],
    ["Een korte rit in de ochtend wint van een uitgestelde.","Op drukke dagen wordt het later vaak niks. Rij als het kan meteen in de ochtend.","Wanneer train ik het beste op drukke dagen?"],
    ["Een rustig uur is ook een goede training.","In december hoeft niet alles zwaar. Rustige uren bouwen je motor.","Waarom zijn rustige trainingen zinvol?"],
    ["Laat geworden? Rustig en kort.","Na een late avond maak je er een korte rustige rit van in plaats van een zware training.","Hoe train ik na een late avond?"],
    ["Zet je training in je agenda.","In de drukste maand van het jaar helpt het om je training echt in te plannen, net als elke andere afspraak.","Hoe maak ik tijd voor trainen in december?"],
    ["Een week minder is een week herstel.","Lukt het minder door de feestdagen? Zie het als een rustweek. In januari ga je fris verder.","Is het erg als ik in december minder train?"],
    ["Rustig rijden met vrienden telt.","Een gezellige rustige groepsrit is precies de duurtraining die je in de winter nodig hebt.","Mag een duurrit ook gezellig zijn?"],
    ["Houd je weerstand op peil.","Genoeg slapen, groente en fruit, en niet diep gaan als je je niet lekker voelt.","Hoe houd ik mijn weerstand op peil?"],
    ['Plan je eerste tocht van het nieuwe jaar.', 'Een datum in de agenda geeft je wintermaanden een doel.', 'Welke tocht past bij mij als eerste doel?'],
    ['Een nieuwe fiets? Laat hem afstellen.', 'Krijg je een nieuwe fiets of onderdelen? Laat je houding goed afstellen voor je kilometers gaat maken.', 'Waar let ik op bij een nieuwe fiets?'],
    ['Een goed voornemen: elke week core.', 'Klein, haalbaar en met resultaat dat je in het voorjaar voelt.', 'Hoe houd ik mijn core vol?'],
    ["Kerstavond: rustig aan.","Een korte rustige rit in de ochtend en dan genieten. Je hoeft vandaag niks te bewijzen.","Hoe train ik rond kerst?"],
    ['Eet groente bij je kerstdiner.', 'Een feestmaaltijd met veel groente geeft je ook nog weerstand in de winter.', 'Hoe eet ik gezond in de winter?'],
    ['Een goede trainer is geen dure trainer.', 'Ook met een eenvoudige trainer en een duidelijk plan kun je een sterke winter neerzetten.', 'Wat heb ik nodig om binnen te trainen?'],
    ["Tussen kerst en oud en nieuw: een lange rit.","Vrije dagen zijn ideaal voor een rustige lange rit. Kleed je warm en neem genoeg eten mee.","Hoe plan ik een lange winterrit?"],
    ['Oudejaarsrit: rustig en samen.', 'Sluit je jaar af met een rustige rit met vrienden. Geen tempo, gewoon genieten.', 'Hoe sluit ik mijn fietsjaar af?'],
    ['Bedankt voor dit jaar.', 'Elke rit die je deed, telt. Wees trots op wat je dit jaar hebt neergezet.', 'Hoe evalueer ik mijn jaar?'],
    ['Morgen begint een nieuw jaar.', 'Eén doel, een plan en consistentie. Meer heb je niet nodig.', 'Hoe begin ik goed aan het nieuwe jaar?']
  ]
};
export const PERSOONLIJK = {
  sneller: [
    ['Sneller worden zit in je drempel.', 'Blokken net onder je FTP, bijvoorbeeld twee keer twintig minuten, doen meer dan elke rit vol gas.', 'Hoe train ik mijn FTP omhoog?'],
    ['Sweetspot geeft veel voor weinig.', 'Net onder je drempel bouw je veel vermogen op met relatief weinig vermoeidheid.', 'Wat is sweetspot en hoe train ik dat?'],
    ['Weet je je FTP niet zeker? Dan gok je.', 'Een goede test of analyse is de basis. Anders train je in de verkeerde zones.', 'Hoe bepaal ik mijn FTP?'],
    ['VO2max-werk is kort en pijnlijk, en het werkt.', 'Blokken van drie tot vijf minuten echt diep. Eén keer per week is voor de meeste renners genoeg.', 'Hoe train ik mijn VO2max?'],
    ['Een sterke basis tilt alles op.', 'Rustige duururen vergroten je motor. Daarop bouw je je snelheid.', 'Waarom zijn rustige duurritten belangrijk om sneller te worden?'],
    ['Watt per kilo telt bergop, watts tellen op het vlakke.', 'Kijk wat jij wilt: snel bergop of hard op het vlakke. Je focus verschilt.', 'Moet ik focussen op watts of op watt per kilo?'],
    ['Sprinten leer je fris.', 'Sprintwerk doe je aan het begin van je training, niet aan het eind met lege benen.', 'Hoe train ik mijn sprint?'],
    ['Langer volhouden is ook sneller.', 'Je drempel na drie uur rijden telt in een lange tocht. Train dus ook je duurvermogen.', 'Hoe train ik mijn uithoudingsvermogen?'],
    ['Hertest na een blok, niet midden in.', 'Na een rustweek zie je wat de training echt heeft gedaan.', 'Wanneer is het beste moment om te testen?'],
    ['Je zwakke punt is je snelste winst.', 'Sterk bergop maar zwak in de wind, of andersom? Daar zit de meeste vooruitgang.', 'Hoe vind ik mijn zwakke punt als renner?'],
    ['Meer is niet altijd beter.', 'Sneller worden komt van de juiste prikkel en genoeg herstel, niet van steeds meer uren.', 'Train ik te veel of te weinig?'],
    ['Over-unders leren je wisselen.', 'Blokken die net boven en net onder je drempel wisselen, maken je beter in tempowisselingen.', 'Wat zijn over-unders?'],
    ['Twee kwaliteitstrainingen per week.', 'Voor de meeste werkende renners is dat genoeg. De rest van de week rustig.', 'Hoeveel zware trainingen per week zijn goed?'],
    ['Positie is gratis snelheid.', 'Lager en smaller zitten scheelt veel wind. Oefen het, zodat je het ook lang volhoudt.', 'Hoe word ik aerodynamischer op de fiets?'],
    ['Je beste twintig minuten zeggen veel.', 'Kijk in je ritten naar je beste twintig minuten. Stijgt die, dan word je sneller.', 'Hoe lees ik mijn vermogensdata?'],
    ['Na een test: zones bijwerken.', 'Een nieuwe FTP betekent nieuwe zones. Anders train je op oude getallen.', 'Hoe pas ik mijn zones aan na een test?'],
    ['Rustig blijft de basis, ook als je sneller wilt.', 'Juist renners die sneller willen, rijden hun rustige ritten vaak te hard.', 'Hoe rustig moet een duurrit zijn?'],
    ['Krachttraining helpt je sprint en je klim.', 'Sterkere benen zetten meer kracht op de pedalen, zeker in korte harde stukken.', 'Helpt krachttraining om sneller te worden?'],
    ['Vergelijk eerlijk.', 'Vergelijk je vermogen bij hetzelfde weer en dezelfde vermoeidheid. Anders lijkt het slechter of beter dan het is.', 'Hoe vergelijk ik mijn ritten eerlijk?'],
    ['Geduld: vermogen groeit in maanden.', 'Een paar procent per blok is een mooie vooruitgang. Hou het vol, dan stapelt het op.', 'Hoe snel kan ik sneller worden?']
  ],
  evenement: [
    ['Op de grote dag probeer je niets nieuws.', 'Alles wat je die dag gebruikt, heb je getest op je lange ritten.', 'Hoe test ik mijn voeding en materiaal voor mijn tocht?'],
    ['De laatste week maakt je fris, niet fitter.', 'Minder uren, een paar korte prikkels en vooral goed slapen.', 'Wat doe ik in de week voor mijn tocht?'],
    ['Het eerste uur bepaalt je laatste uur.', 'Begin rustiger dan je denkt. Wat je vroeg te hard gaat, betaal je aan het eind dubbel terug.', 'Hoe deel ik mijn krachten in op een lange tocht?'],
    ['Ken je parcours.', 'Rijd trainingen op vergelijkbaar terrein: lange klimmen, kasseien of gravel.', 'Hoe bereid ik me voor op het parcours van mijn tocht?'],
    ['Je langste trainingsrit is je generale repetitie.', 'Rijd hem met hetzelfde tempo, dezelfde voeding en dezelfde kleding.', 'Hoe lang moet mijn langste trainingsrit zijn?'],
    ['Eten op schema, niet op gevoel.', 'Zet een herinnering op je fietscomputer, bijvoorbeeld elk half uur.', 'Hoeveel moet ik eten tijdens mijn tocht?'],
    ['Leg je spullen de avond ervoor klaar.', 'Kleding, voeding, nummer, banden gecheckt. Dan begin je de ochtend rustig.', 'Wat neem ik mee naar mijn tocht?'],
    ['Slaap twee nachten ervoor telt het zwaarst.', 'De nacht voor een tocht slaap je vaak slecht. Dat is normaal.', 'Wat als ik slecht slaap voor mijn tocht?'],
    ['Een tocht van zes uur rijd je niet op karakter.', 'Je rijdt hem op tempo, voeding en een goede indeling.', 'Hoe maak ik een plan voor mijn tocht?'],
    ['Plan je opbouw terug vanaf de datum.', 'Wanneer je langste rit, wanneer je rustweek, wanneer je afbouwt.', 'Hoe plan ik mijn opbouw naar mijn tocht?'],
    ['Weet waar de bevoorrading is.', 'Ken de posten en wat je daar pakt. Dan sta je er kort en vergeet je niks.', 'Hoe gebruik ik de bevoorrading slim?'],
    ['Check het weer drie dagen ervoor.', 'Dan heb je tijd om je kleding en je spanning aan te passen.', 'Hoe bereid ik me voor op het weer van mijn tocht?'],
    ['Ontbijt drie uur voor de start.', 'Iets met koolhydraten dat je kent. Geen experimenten op de ochtend van je tocht.', 'Wat eet ik op de ochtend van mijn tocht?'],
    ['Begin in je eigen groep.', 'Start niet tussen renners die veel sneller zijn. Je wordt meegezogen en betaalt het later.', 'Waar start ik in een grote tocht?'],
    ['Een pacingplan haalt de gok eruit.', 'Weet per stuk hoe hard je mag. Dan houd je over voor de laatste klim.', 'Hoe maak ik een pacingplan voor mijn tocht?'],
    ['Na je tocht een rustige week.', 'Je hebt diep gegraven. Gun jezelf een week herstel voor je weer opbouwt.', 'Hoe herstel ik na mijn tocht?'],
    ['Train op het uur van de start.', 'Rijd een paar lange ritten op het tijdstip waarop je tocht begint. Dan went je lichaam eraan.', 'Moet ik trainen op het tijdstip van mijn tocht?'],
    ['Een reservebinnenband is je verzekering.', 'Ook bij een georganiseerde tocht ben je bij pech eerst op jezelf aangewezen.', 'Wat neem ik mee voor pech tijdens mijn tocht?'],
    ['Visualiseer het zwaarste stuk.', 'Denk van tevoren na over hoe je het zwaarste moment doorkomt. Dan overvalt het je niet.', 'Hoe bereid ik me mentaal voor op mijn tocht?'],
    ['Geniet van de dag.', 'Je hebt er maanden voor getraind. Kijk om je heen, het is jouw dag.', 'Hoe haal ik het meeste uit mijn tocht?']
  ],
  afvallen: [
    ['Afvallen en sneller worden gaat samen.', 'Zolang je op trainingsdagen genoeg eet. Bespaar liever op rustdagen.', 'Hoe val ik af zonder watts te verliezen?'],
    ['Train niet nuchter als je zwaar gaat.', 'Een rustige duurrit nuchter kan. Een zware training zonder brandstof kost je kwaliteit en spiermassa.', 'Kan ik nuchter trainen om af te vallen?'],
    ['Eiwit bij elke maaltijd.', 'Het houdt je langer vol en beschermt je spieren als je minder eet.', 'Hoeveel eiwit heb ik nodig als wielrenner?'],
    ['Kijk naar het gemiddelde, niet naar vandaag.', 'Je gewicht schommelt per dag. Weeg een paar keer per week en volg de trend.', 'Hoe houd ik mijn gewicht goed bij?'],
    ['Een lange rit is geen vrijbrief.', 'Eet goed na je rit, en houd het daarna normaal.', 'Hoeveel mag ik eten na een lange rit?'],
    ['Langzaam afvallen blijft eraf.', 'Een kleine, haalbare daling per week houdt je sterk op de fiets.', 'Hoe snel kan ik verantwoord afvallen?'],
    ['Drinken is ook eten.', 'Frisdrank, sapjes en alcohol tellen flink mee. Daar zit vaak de makkelijkste winst.', 'Wat zijn de makkelijkste dingen om te laten staan?'],
    ['Slaap tekort maakt hongerig.', 'Na een korte nacht heb je meer trek, vooral in snelle suikers.', 'Hoe helpt slaap bij afvallen?'],
    ['Eet op de fiets, ook als je afvalt.', 'Wie op een lange rit niks eet, komt uitgehongerd thuis en eet daarna juist te veel.', 'Moet ik eten op de fiets als ik wil afvallen?'],
    ['Groente vult zonder veel te kosten.', 'Een halve bord groente maakt je maaltijd groot en voedzaam zonder veel extra.', 'Hoe eet ik genoeg zonder te veel binnen te krijgen?'],
    ['Plan je snacks.', 'Een stuk fruit of yoghurt op een vast moment voorkomt dat je op een zwak moment naar de koektrommel grijpt.', 'Wat zijn goede tussendoortjes?'],
    ['Rustdag, minder koolhydraten.', 'Op een rustdag heb je minder brandstof nodig. Eiwit en groente blijven gewoon.', 'Hoe pas ik mijn eten aan op een rustdag?'],
    ['Watt per kilo is de beloning.', 'Lichter worden met dezelfde watts maakt je bergop sneller. Dat is het mooie doel.', 'Hoe bereken ik mijn watt per kilo?'],
    ['Geen verboden lijst.', 'Alles mag af en toe. Wie zichzelf alles verbiedt, houdt het niet vol.', 'Hoe houd ik afvallen vol?'],
    ['Weeg je eten een week.', 'Een week bijhouden wat je eet, laat zien waar het zit. Daarna weet je het zonder te wegen.', 'Hoe krijg ik inzicht in wat ik eet?'],
    ['Krachttraining helpt bij afvallen.', 'Spieren verbruiken ook in rust energie. En je blijft sterk terwijl je lichter wordt.', 'Helpt krachttraining bij afvallen?']
  ],
  fit: [
    ['Plezier houdt je op de fiets.', 'Rij eens een nieuwe route, of plan een rit met vrienden via de groepsrit in de app.', 'Hoe houd ik het leuk en blijf ik gemotiveerd?'],
    ['Twee of drie keer per week is genoeg.', 'Om fit te blijven wint regelmaat het van af en toe heel lang.', 'Hoe vaak moet ik rijden om fit te blijven?'],
    ['Af en toe stevig doortrappen houdt je scherp.', 'Een paar keer per rit een stuk tempo maakt je conditie sterker.', 'Hoe blijf ik fit zonder strak schema?'],
    ['Kies een doel, hoe klein ook.', 'Een rondje sneller, een nieuwe klim of een tocht met vrienden.', 'Welk doel past bij mij?'],
    ['Bewegen naast de fiets helpt.', 'Een wandeling, wat core of even rekken. Je lijf houdt van afwisseling.', 'Wat kan ik naast fietsen doen om fit te blijven?'],
    ['Elke rit telt.', 'Een uurtje rustig is niet minder waard dan een lange tocht.', 'Heeft een kort ritje wel zin?'],
    ['Rij eens zonder meter.', 'Een rit op gevoel, gewoon genieten van de weg.', 'Is het goed om soms zonder data te rijden?'],
    ['Rij naar je werk.', 'Een paar keer per week op de fiets naar je werk is gratis training.', 'Hoe kan ik fietsen in mijn dag inpassen?'],
    ['Een vaste rit met een maat.', 'Elke week dezelfde dag samen rijden houdt het leuk en vol te houden.', 'Hoe blijf ik regelmatig rijden?'],
    ['Ontdek je omgeving.', 'Kies elke maand een weg die je nog nooit hebt gereden. Fietsen is ook ontdekken.', 'Hoe vind ik nieuwe routes?'],
    ['Een koffiestop is ook een rit.', 'Een rustige rit naar een mooi terras is precies goed om fit te blijven.', 'Mag fietsen ook gewoon gezellig zijn?'],
    ['Sterk blijven met de jaren.', 'Core en een beetje kracht houden je soepel en stabiel, ook als je ouder wordt.', 'Wat kan ik doen om fit te blijven met de jaren?'],
    ['Luister naar je lijf.', 'Moe? Rij rustig of sla een dag over. Fit blijven is een lange termijn.', 'Wanneer neem ik beter rust?'],
    ['Een fietsvakantie als doel.', 'Een week fietsen in een mooie streek is een geweldig doel om naartoe te werken.', 'Hoe bereid ik me voor op een fietsvakantie?']
  ],
  core: [
    ['Een sterke romp brengt je kracht op de pedalen.', 'Anders lekt hij weg in een wiebelend bovenlijf. Vooral in het laatste uur.', 'Waarom helpt core training op de fiets?'],
    ['Core op een rustige dag.', 'Doe je sessie op een rustdag of na een rustige rit, niet vlak voor een zware training.', 'Wanneer doe ik het beste mijn core training?'],
    ['Drie keer kort wint van één keer lang.', 'Drie keer per week tien minuten maakt je sterker dan één keer een half uur.', 'Hoe vaak moet ik core trainen?'],
    ['Rugpijn op de fiets zit vaak in je romp.', 'Een vermoeide romp laat je rug het werk doen. Laat aanhoudende pijn altijd checken.', 'Kan core helpen tegen rugpijn op de fiets?'],
    ['Techniek voor tijd.', 'Een plank van dertig seconden met een rechte rug is meer waard dan een minuut doorgezakt.', 'Hoe weet ik of ik mijn oefening goed doe?'],
    ['Je Rompscore is je bewijs.', 'Doe je test op een frisse dag. Dan zie je eerlijk wat het je heeft opgeleverd.', 'Hoe vaak moet ik mijn Rompscore testen?'],
    ['Links en rechts zijn niet gelijk.', 'Bijna iedereen heeft een sterkere kant. Als je dat weet, kun je het bijtrekken.', 'Wat doe ik aan een verschil tussen links en rechts?'],
    ['Adem door.', 'Bij een plank houd je makkelijk je adem in. Rustig doorademen maakt de oefening beter en makkelijker.', 'Hoe adem ik tijdens core oefeningen?'],
    ['Je reeks is je motor.', 'Elke week je sessies doen bouwt meer dan een paar goede weken en dan stoppen.', 'Hoe houd ik mijn core vol?'],
    ['Pijn is geen vermoeidheid.', 'Brandende spieren zijn goed. Stekende pijn of pijn in een gewricht is een reden om te stoppen.', 'Wanneer stop ik met een oefening?'],
    ['Core voor je tocht? Rustig aan.', 'In de laatste dagen voor een tocht doe je minder core, zodat je fris aan de start staat.', 'Doe ik core in de week voor mijn tocht?'],
    ['Stabiel zitten scheelt watts.', 'Hoe minder je bovenlijf beweegt, hoe meer van je kracht naar de pedalen gaat.', 'Hoe helpt core mijn vermogen?'],
    ['Heupen en billen tellen mee.', 'Je romp is meer dan je buik. Sterke billen en heupen houden je knieën en rug goed.', 'Waarom train ik ook mijn billen en heupen?'],
    ['Na een lange rit: even mobiliseren.', 'Een paar rustige bewegingen voor je rug en heupen na een lange rit voelen goed.', 'Wat doe ik na een lange rit voor mijn rug?'],
    ['Een niveau omhoog is verdiend.', 'Gaat het makkelijk, dan ga je door. Te snel omhoog met slechte techniek levert niks op.', 'Wanneer ga ik een niveau omhoog?']
  ],
  schema: [
    ['Lees de uitleg bij je training.', 'In TrainingPeaks staat bij elke training waarom je hem doet. Als je het doel snapt, rijd je hem beter.', 'Hoe haal ik het meeste uit mijn schema?'],
    ['Schuif liever dan dat je propt.', 'Lukt een dag niet, verschuif dan je training. Twee zware trainingen op één dag werkt niet.', 'Wat doe ik als mijn schema niet in mijn week past?'],
    ['Rustig op je schema is echt rustig.', 'Als er een rustige rit staat, heeft dat een reden.', 'Waarom staan er zoveel rustige ritten in mijn schema?'],
    ['Je schema is een plan, geen wet.', 'Ziek, moe of een drukke week? Pas aan. Een schema helpt je, het moet je niet slopen.', 'Wanneer mag ik afwijken van mijn schema?'],
    ['Vink je trainingen af.', 'Als je ze afvinkt in TrainingPeaks, zie je je consistentie groeien.', 'Hoe houd ik mijn schema goed bij?'],
    ['Kijk op zondag naar je week.', 'Weet welke trainingen er komen en plan ze in je agenda.', 'Hoe plan ik mijn schema in mijn week?'],
    ['De rustweek in je schema is geen fout.', 'Hij staat er bewust. Daarna ga je sterker verder.', 'Waarom staat er een rustweek in mijn schema?'],
    ['Een training gemist? Niet inhalen.', 'Gewoon verder met wat er vandaag staat. Je schema vangt een gemiste dag op.', 'Wat doe ik als ik een training mis?'],
    ['Rijd je blokken in de goede zone.', 'Net boven de zone is niet beter. Het doel van een training zit in de juiste zone.', 'Wat als ik harder kan dan mijn zone?'],
    ['Na je schema: hertest.', 'Aan het eind van je blok zie je met een test of analyse wat het heeft opgeleverd.', 'Wanneer test ik na mijn schema?'],
    ['Buiten of binnen, allebei goed.', 'Je kunt je trainingen buiten of op de trainer doen. Binnen is het makkelijker om je zones vast te houden.', 'Doe ik mijn training binnen of buiten?'],
    ['Een vervolgschema bouwt verder.', 'Na je blok ga je verder vanaf waar je nu staat, niet weer bij het begin.', 'Wat doe ik na mijn schema?']
  ],
  hartslag: [
    ['Je hartslag loopt achter.', 'Bij een korte, harde inspanning heeft je hartslag even nodig om omhoog te komen. Kijk bij korte blokken naar je gevoel.', 'Hoe train ik korte blokken op hartslag?'],
    ['Warm weer, hogere hartslag.', 'Bij warmte of na een korte nacht ligt je hartslag hoger bij hetzelfde tempo. Pas je tempo aan.', 'Waarom is mijn hartslag soms hoger dan normaal?'],
    ['Een borstband is preciezer dan je horloge.', 'Polsmeting kan afwijken, zeker bij intervallen.', 'Heb ik een hartslagband nodig?'],
    ['Je omslagpunt is je kompas.', 'Al je zones hangen eraan. Test het af en toe opnieuw.', 'Hoe bepaal ik mijn omslagpunt?'],
    ['Lage hartslag bij hetzelfde tempo is vooruitgang.', 'Rijd je dezelfde ronde met een lagere hartslag, dan is je conditie beter geworden.', 'Hoe zie ik vooruitgang op hartslag?'],
    ['Hartslag stijgt op een lange rit.', 'Na een paar uur loopt je hartslag op bij hetzelfde tempo. Dat zegt iets over je duurvermogen.', 'Waarom loopt mijn hartslag op tijdens een lange rit?'],
    ['Koffie en stress tillen je hartslag.', 'Een hoge hartslag aan het begin van een rit zegt niet altijd dat je moe bent.', 'Wat beïnvloedt mijn hartslag?'],
    ['Een rustpols in de ochtend zegt veel.', 'Is je rustpols een paar slagen hoger dan normaal, dan ben je misschien moe of ziek aan het worden.', 'Wat zegt mijn rustpols?'],
    ['Zones op hartslag zijn breder.', 'Hartslag reageert trager en wisselt meer. Rijd rustig in je zone en kijk niet elke seconde.', 'Hoe rijd ik goed op hartslag?'],
    ['Een vermogensmeter is een mooie volgende stap.', 'Hartslag werkt prima. Vermogen laat je ook direct zien wat je trapt, zonder vertraging.', 'Moet ik overstappen op een vermogensmeter?']
  ]
};

const alsTip = (c, x) => ({ c, k: x[0], t: x[1], v: x[2] });
// Alles onder elkaar, voor het overzicht.
export const TIPS = [
  ...Object.entries(KALENDER).flatMap(([m, l]) => l.map((x) => alsTip('maand' + m, x))),
  ...Object.entries(PERSOONLIJK).flatMap(([c, l]) => l.map((x) => alsTip(c, x)))
];

// De tip van vandaag. Normaal de tip van deze dag in de maand. Eén dag per week
// (en als er iets persoonlijks te zeggen valt) een tip op maat, die door je
// persoonlijke lijst heen loopt zodat hij zo min mogelijk terugkomt.
const KAL_KOPPEN = new Set(Object.values(KALENDER).flat().map((x) => x[0]));
export function tipVoor({ doel, core, schema, hartslag, datum = new Date() } = {}) {
  const d = new Date(datum.getTime() + 2 * 3600e3);
  const jaarBegin = Date.UTC(d.getUTCFullYear(), 0, 1);
  const dvj = Math.floor((d.getTime() - jaarBegin) / 864e5); // 0..365
  const alle = [
    ...(doel && PERSOONLIJK[doel] ? PERSOONLIJK[doel] : []),
    ...(core ? PERSOONLIJK.core : []),
    ...(schema ? PERSOONLIJK.schema : []),
    ...(hartslag ? PERSOONLIJK.hartslag : [])
  ];
  // Wat al in de kalender staat, zie je daar al: niet nog eens als tip op maat.
  const pers = alle.filter((x) => !KAL_KOPPEN.has(x[0]));
  // Hoe vaak een tip op maat? Minstens een week ertussen, en nooit vaker dan de
  // lijst lang is, zodat er binnen een jaar niets terugkomt.
  const elke = pers.length ? Math.max(7, Math.ceil(365 / pers.length)) : 0;
  if (elke && dvj % elke === 3) {
    const n = Math.floor(dvj / elke) + d.getUTCFullYear() * 7;
    return alsTip('persoonlijk', pers[n % pers.length]);
  }
  const maand = KALENDER[d.getUTCMonth() + 1];
  return alsTip('maand', maand[(d.getUTCDate() - 1) % maand.length]);
}

// ===========================================================================
// Bruggetje naar je doel (12-10-2026): onder elke tip één of twee zinnen die
// de tip koppelen aan jouw doel. Opgebouwd uit: waar de tip over gaat (thema),
// hoe ver je doel weg is (fase) en wat voor tocht het is (gravel, bergen,
// kasseien, toer). Zo staat er bij "minder uren" in oktober niet zomaar
// minder trainen, maar waarom dat nu prima is op weg naar jouw tocht.
// ===========================================================================
// Thema per tip: hele woorden, in volgorde van voorrang. Uitzonderingen staan in THEMA_VAST.
const THEMA_REGELS = [
  ['kracht', /\b(core|romp|kracht|krachttraining|squat|squats|lunge|lunges|plank|rekken|rek|heupbuigers|eenbenig|rompscore)\b/],
  ['voeding', /\b(eet|eten|drink|drinken|bidon|bidons|koolhydraten|gel|gels|reep|repen|ontbijt|maag|darmen|eiwit|honger|hongerklop|brandstof|groente|snacks|tussendoortjes|ijsje|sportdrank|bouillon|zout|weeg|gewicht|wintervet|kerstdiner)\b|man met de hamer/],
  ['herstel', /\b(rust|rustdag|rustdagen|rustweek|herstel|herstelrit|slaap|slapen|ziek|ziekte|griep|vakantie|vrije|uitrijden|seizoen)\b|niet fietsen/],
  ['klim', /\b(klim|klimmen|klimmetjes|col|cols|berg|bergen|bergweek|bergdag|bergreis|hoogte|dalen|afdaling|afdalen|haarspeldbochten)\b/],
  ['weer', /\b(kou|koud|koude|warm|warmte|hitte|heet|regen|regenrit|regenjack|wind|herfstwind|windjack|handschoenen|overschoenen|kleding|laagjes|zon|zonnebrand|winterzonnetje|mist|gladheid|ijzel|bladeren|pollen|onweer|wespen|muts|fietspetje|weer)\b/],
  ['materiaal', /\b(band|banden|spanning|ketting|remmen|tubeless|velg|zadel|onderhoud|verlichting|lampje|knipperlicht|achterlicht|ventiel|schoenen|bril|lens|verzet|ventilator|huurfiets|fietskoffer|spatborden|winterfiets|pech|binnenband|strooizout)\b|trainer klaarzetten/],
  ['techniek', /\b(bocht|bochten|groep|groepsrit|waaier|waaieren|wiel|kasseien|gravel|gravelroute|gravelrit|lijn|sprint|sprinten|kopwerk|sturen|veldrijden)\b|bidon pakken/],
  ['mentaal', /\b(motivatie|hoofd|doel|plan|consistent|gewoonte|vergelijk|vergelijken|plateau|strava|agenda|plezier|genieten|terugkijken|voornemen)\b/]
];
export const THEMA_VAST = {
  // training
  'Een trainer-uur mag kort en gericht.': 'training', 'Eén goede zware training wint van drie halve.': 'training', 'De eerste lange rit mag rustig.': 'training',
  'Drukke zomer? Kort en gericht.': 'training', 'Op de trainer: kies vooraf je doel.': 'training', 'Rijd je blokken in de goede zone.': 'training', 'Lees de uitleg bij je training.': 'training',
  'Een trainingskamp begint thuis.': 'training', 'De langste rit is je generale repetitie.': 'training', 'Je zwakke punt is je snelste winst.': 'training', 'Positie is gratis snelheid.': 'training',
  'Je langste trainingsrit is je generale repetitie.': 'training', 'Een vervolgschema bouwt verder.': 'training', 'Winterkilometers zijn rustige kilometers.': 'training', 'Warm op, zeker in de kou.': 'training',
  'Oktober is de start van je winter.': 'training', 'Een winterplan in drie blokken.': 'training', 'November is basismaand.': 'training', 'Lange duurritten bouwen je vetverbranding.': 'training',
  'Tussen kerst en oud en nieuw: een lange rit.': 'training', 'Combineer slim: drempel op dinsdag, lang in het weekend.': 'training', 'Hertest na een blok, niet midden in.': 'training',
  'Zomer is geen reden voor drie uur per dag.': 'training', 'Na de vakantie: hertest.': 'training', 'Druk op het werk na de vakantie?': 'training', 'Elke training heeft een reden.': 'training',
  'Meer is niet altijd beter.': 'training', 'Een tempo-rit alleen is goud.': 'training', 'Rustig rijden met vrienden telt.': 'training', 'Een buitenrit op tempo meet meer dan een test.': 'training',
  'Een rondje om de kerktoren telt ook.': 'training',
  // mentaal
  'Een slechte dag zegt niks.': 'mentaal', 'Kijk terug op je jaar.': 'mentaal', 'Wat ging dit jaar het best?': 'mentaal', 'Bedankt voor dit jaar.': 'mentaal', 'Leer van je beste rit.': 'mentaal',
  'Leer van je slechtste rit.': 'mentaal', 'Een gemiste training is geen gemiste week.': 'mentaal', 'Geduld in maart, vorm in mei.': 'mentaal', 'Geduld in de winter, vorm in het voorjaar.': 'mentaal',
  'Geniet van wat je hebt opgebouwd.': 'mentaal', 'Geniet van de dag.': 'mentaal', 'Visualiseer het zwaarste stuk.': 'mentaal', 'Een najaarstocht is een mooi slot.': 'mentaal',
  'Een klassieker rijd je ook in je hoofd.': 'mentaal', 'Geniet van de lange dagen.': 'mentaal', 'September is terug naar het ritme.': 'mentaal', 'Een paar dagen niks? Morgen weer.': 'mentaal',
  'Vergelijk eerlijk.': 'mentaal', 'Donker en koud? Spreek af.': 'mentaal', 'Motivatie na het seizoen.': 'mentaal', 'Kies een winterdoel.': 'mentaal', 'Kleine stappen, grote winst.': 'mentaal',
  'Een maand basis zit erop.': 'mentaal', 'Een slechte rit is ook informatie.': 'mentaal', 'Een plateau is geen eindpunt.': 'mentaal', 'Plan je opbouw terug vanaf de datum.': 'mentaal',
  'Vooruitgang voelt pas achteraf.': 'mentaal', 'Halverwege het jaar: even terugkijken.': 'mentaal', 'Na de Tour: kies je najaarsdoel.': 'mentaal', 'Augustus is genieten van je vorm.': 'mentaal',
  'Een plateau na de zomer is normaal.': 'mentaal', 'Kies je doel voor het najaar.': 'mentaal', 'Een rondje zonder doel.': 'mentaal', 'Een nieuw seizoen begint in je hoofd.': 'mentaal',
  'Je seizoen in drie getallen.': 'mentaal', 'Je schema is een plan, geen wet.': 'mentaal', 'Plezier houdt je op de fiets.': 'mentaal', 'Een virtuele groepsrit.': 'mentaal',
  'Plan je zomervakantie met de fiets.': 'mentaal', 'Kies een doel, hoe klein ook.': 'mentaal', 'Een rondje sneller dan vorig jaar.': 'mentaal', 'Een pacingplan haalt de gok eruit.': 'mentaal',
  // herstel
  'Kerstavond: rustig aan.': 'herstel', 'Luister naar je lijf.': 'herstel', 'Twijfel je? Rij rustig en kort.': 'herstel', 'Moe aan de start? Maak het een rustig uur.': 'herstel',
  'Werkstress telt ook als training.': 'herstel', 'Een rustige dag is geen luie dag.': 'herstel', 'Een rustige week na drie zware.': 'herstel', 'Een rustige week rond de kerst.': 'herstel',
  'Laat geworden? Rustig en kort.': 'herstel', 'Houd je weerstand op peil.': 'herstel', 'Handen wassen na een groepsrit.': 'herstel',
  // voeding
  'Begin je tocht met een plan voor de stops.': 'voeding', 'Watt per kilo is de beloning.': 'voeding', 'Op de grote dag probeer je niets nieuws.': 'voeding', 'Weet waar de bevoorrading is.': 'voeding',
  'Langzaam afvallen blijft eraf.': 'voeding', 'Geen verboden lijst.': 'voeding', 'Eet genoeg eiwit.': 'voeding', 'Iets warms na een koude rit.': 'voeding', 'Weet waar je water kunt halen.': 'voeding',
  // kracht
  'Drie keer kort wint van één keer lang.': 'kracht', 'Links en rechts zijn niet gelijk.': 'kracht', 'Je reeks is je motor.': 'kracht', 'Pijn is geen vermoeidheid.': 'kracht',
  'Na een lange rit: even mobiliseren.': 'kracht', 'Een niveau omhoog is verdiend.': 'kracht',
  // materiaal
  'Een goede trainer is geen dure trainer.': 'materiaal', 'Vergeet je achterzak niet.': 'materiaal', 'Een handdoek over je stuur.': 'materiaal', 'Laat je trainer klaarstaan.': 'materiaal',
  'Een nieuwe fiets? Laat hem afstellen.': 'materiaal', 'Een hartslagband is preciezer dan je horloge.': 'materiaal', 'Een borstband is preciezer dan je horloge.': 'materiaal',
  'Een vermogensmeter is een mooie volgende stap.': 'materiaal', 'Leg je spullen de avond ervoor klaar.': 'materiaal', 'Leer een band plakken voor je hem nodig hebt.': 'materiaal',
  'Na een regenrit: fiets droog, ketting gesmeerd.': 'materiaal', 'Een zonnebril is geen mode.': 'materiaal', 'Bandenspanning en warmte.': 'materiaal', 'Avondritten met verlichting.': 'materiaal',
  'Een goede bril voor elk licht.': 'materiaal', 'Na een natte rit: schoenen drogen.': 'materiaal', 'Check je ventiel in de kou.': 'materiaal', 'Loop je banden na op sneetjes.': 'materiaal',
  'Binnen gepompt is buiten zachter.': 'materiaal', 'Check je fietsmaten voor het seizoen.': 'materiaal', 'Huur je een fiets op vakantie?': 'materiaal', 'Neem je fiets mee? Pak hem goed in.': 'materiaal',
  'Vergeet je fiets niet.': 'materiaal', 'Nat wegdek? Iets zachter pompen.': 'materiaal', 'Op gravel: zachter pompen.': 'materiaal', 'Check je remmen voor de bergen.': 'materiaal',
  'Check je banden na een bergweek.': 'materiaal',
  // weer
  'Zomerse buien zijn heftig.': 'weer', 'Een sterke wind is gratis kracht.': 'weer', 'Warme vingers beginnen bij een warme romp.': 'weer', 'Water over je hoofd koelt.': 'weer',
  'Na een hete rit: eerst afkoelen.': 'weer', 'Wespentijd: let op je bidon.': 'weer', 'Zonnebrand is ook materiaal.': 'weer', 'Een tempo-blok in de warmte: korter.': 'weer',
  'Een tempo-blok op een warme dag: korter.': 'weer', 'Zon in maart is nog geen warmte.': 'weer', 'Lichte kleding, open rits.': 'weer', 'Vliegjes en wespen: bril op, mond dicht.': 'weer',
  'Regen in de bergen is koud.': 'weer',
  // techniek
  'Een strook van tevoren verkennen.': 'techniek', 'Leer waaieren.': 'techniek', 'Maart is de maand van de eerste klassiekers.': 'techniek', 'Een groepsrit plannen?': 'techniek',
  'Bochten: remmen voor de bocht.': 'techniek', 'Rij eens een gravelroute.': 'techniek', 'Kijk de klassiekers met een doel.': 'techniek', 'Kijk de Tour met een doel.': 'techniek',
  'Leer een bidon pakken.': 'techniek', 'Gravel is de herfstsport.': 'techniek', 'Ken je parcours.': 'techniek', 'Losse ondergrond: blijf zitten.': 'techniek'
};
export function themaVan(tip) {
  if (!tip) return 'training';
  if (THEMA_VAST[tip.k]) return THEMA_VAST[tip.k];
  const s = (tip.k + ' ' + tip.t).toLowerCase();
  for (const [thema, re] of THEMA_REGELS) if (re.test(s)) return thema;
  return 'training';
}
const MINDER = /minder uren|minder fietsen|minder trainen|rustweek|rust na|rustige week|week minder|niet fietsen|vrije week|winterstop/;

function faseVan(nog) {
  if (nog == null) return 'basis';
  if (nog < -7) return null;
  if (nog < 0) return 'na';
  if (nog === 0) return 'dag';
  if (nog <= 7) return 'week';
  if (nog <= 21) return 'laatste';
  if (nog <= 56) return 'specifiek';
  if (nog <= 112) return 'opbouw';
  return 'basis';
}
const BRUG = {
  basis: {
    voeding: 'Gebruik deze maanden om je maag te trainen: eet op elke rit van meer dan anderhalf uur. Dan werkt het straks ook in de tocht zelf.',
    herstel: 'Je hebt de tijd. Wie nu goed rust en consequent blijft, kan in het voorjaar meer aan.',
    kracht: 'Dit is de beste tijd voor kracht en core. In de laatste maanden zie je dat terug in je laatste uur.',
    klim: 'Je hebt tijd om klimvermogen op te bouwen. Lange blokken op tempo lijken het meest op een lange klim.',
    training: 'Nu bouw je de basis: rustige uren en wat drempelwerk. Dat is de motor waar je straks op rijdt.',
    materiaal: 'Tijd genoeg om je materiaal op orde te brengen en uit te proberen, zodat je op de dag nergens over twijfelt.',
    weer: 'Of je nu binnen of buiten rijdt: elke training in deze maanden telt straks mee. Zo bouw je je basis.',
    techniek: 'Oefen dit nu op rustige ritten. Wat je nu leert, gaat op de dag vanzelf.',
    mentaal: 'Het voelt nog ver weg, maar elke week telt. Kleine stappen nu maken het verschil op de dag zelf.'
  },
  opbouw: {
    voeding: 'Oefen op je lange ritten nu met precies wat je op de dag gaat eten en drinken.',
    herstel: 'De trainingen worden zwaarder, dus je rust telt nu dubbel.',
    kracht: 'Houd je core vast. Dan blijf je stabiel als de ritten langer worden.',
    klim: 'Zoek nu de heuvels op, of doe lange blokken op tempo. Zo bereid je je voor op de klimmen.',
    training: 'Je training wordt nu specifieker: langere ritten en meer tempo, richting de dag zelf.',
    materiaal: 'Rij nu op het materiaal waarmee je de tocht rijdt, dan weet je dat alles werkt.',
    weer: 'Test je kleding op lange ritten, zodat je weet wat je op de dag aantrekt.',
    techniek: 'Zoek terrein op dat lijkt op je tocht en oefen het daar.',
    mentaal: 'Nu het serieuzer wordt: houd vast aan je plan, juist als het even tegenzit.'
  },
  specifiek: {
    voeding: 'Je voedingsplan moet nu vaststaan: wat je eet, wanneer en hoeveel. Test het op je langste rit.',
    herstel: 'Dit zijn je zwaarste weken. Goed slapen en eten maakt nu het verschil.',
    kracht: 'Over een paar weken bouwt je Core af. Nu nog even sterk doorwerken.',
    klim: 'Rij je klimmen nu op het tempo dat je op de dag wilt volhouden.',
    training: 'Je langste ritten komen eraan. Rij ze op het tempo dat je op de dag wilt rijden.',
    materiaal: 'Nu is het moment om alles voor de dag te testen. Wat nu werkt, gebruik je straks.',
    weer: 'Kijk hoe je je kleding voor de dag regelt, en test die nu op je lange ritten.',
    techniek: 'Oefen het nog een paar keer op terrein zoals op de dag zelf.',
    mentaal: 'Maak een plan voor de dag zelf: je tempo, wat je eet en waar je even rust.'
  },
  laatste: {
    voeding: 'Eet en drink niets nieuws meer: alleen wat je al getest hebt.',
    herstel: 'Je fitheid staat. Vanaf hier gaat het om fris worden: minder volume en goed slapen.',
    kracht: 'Je Core bouwt nu af: geen nieuwe oefeningen meer, korter en frisser.',
    klim: 'Je klimvermogen staat. Houd je benen nu fris voor de dag zelf.',
    training: 'Je fitheid staat. Vanaf hier gaat het om fris worden, niet om nog fitter te worden.',
    materiaal: 'Verander niets meer aan je fiets. Check alleen dat alles goed werkt.',
    weer: 'Houd het weer voor de dag in de gaten en leg je kleding alvast klaar.',
    techniek: 'Oefen niets nieuws meer. Vertrouw op wat je kunt.',
    mentaal: 'Je bent er klaar voor. Vertrouw op wat je de afgelopen maanden hebt gedaan.'
  },
  week: {
    voeding: 'Eet de laatste dagen goed en vertrouwd, met genoeg koolhydraten.',
    algemeen: 'Rustig aan, kort en fris. Leg je spullen klaar en vertrouw op wat je hebt gedaan.'
  },
  dag: { algemeen: 'Begin rustig, eet op schema en geniet ervan.' },
  na: { algemeen: 'Neem een paar rustige dagen en kies dan je volgende doel.' }
};
// Een extra zin per soort tocht, als die iets toevoegt.
const SOORT = {
  gravel: { materiaal: 'Rij ook alvast op onverhard, met de banden die je in de tocht gebruikt.', techniek: 'Op gravel help je jezelf met ontspannen armen en vooruit kijken.' },
  bergen: { training: 'Lange blokken op tempo lijken het meest op een col.', klim: 'Oefen ook het dalen, dat bepaalt je dag net zo goed.' },
  kasseien: { materiaal: 'Oefen ook eens op kasseien, met iets zachtere banden.', techniek: 'Op kasseien: grote versnelling, losse handen, en vooruit kijken.' }
};
export function tochtSoort(naam) {
  const n = String(naam || '').toLowerCase();
  if (/gravel|traka|unbound|rift|gralloch|santa vall|big sugar|migration|sbt|waffle|mid south|houffa|one fifty|marly|grav/.test(n)) return 'gravel';
  if (/criterium|wedstrijd|koers|crit\b/.test(n)) return 'crit';
  if (/vlaanderen|roubaix|omloop|flanders|wevelgem|kassei|ename|chouffe/.test(n)) return 'kasseien';
  if (/marmotte|tzaler|ventoux|dolomit|tape|stelvio|alpe|haute route|ballons|tour du als|klimmen|quebranta|transalp|dreil|stations|mallorca|nove colli|fausto|vosges|bastogne/.test(n)) return 'bergen';
  return 'toer';
}
const DOEL_BRUG = {
  sneller: {
    voeding: 'Voor sneller worden is goed eten geen bijzaak: wie genoeg brandstof heeft, haalt meer uit elke training.',
    herstel: 'Voor sneller worden: in je rust word je sterker. Sla hem niet over.',
    training: 'Voor sneller worden draait het precies hierom: de juiste prikkel op het juiste moment.',
    kracht: 'Voor sneller worden: een sterke romp zet meer van je kracht om in snelheid.',
    klim: 'Voor sneller worden: klimmen is eerlijk. Hier zie je het eerst als je vermogen groeit.',
    materiaal: 'Voor sneller worden: goed materiaal en de juiste spanning zijn de makkelijkste winst die er is.',
    weer: 'Voor sneller worden telt dat je blijft trainen, ook als het weer tegenzit. Binnen of buiten, consequent wint.',
    techniek: 'Voor sneller worden: wie slim in de groep of in de bochten rijdt, spaart energie voor waar het telt.',
    mentaal: 'Voor sneller worden: vooruitgang zie je per maand, niet per rit. Houd vol, dan komt hij.'
  },
  afvallen: {
    voeding: 'Voor afvallen: eet genoeg op trainingsdagen, zodat je sterk blijft. Minderen doe je op rustdagen.',
    herstel: 'Voor afvallen: goed slapen remt de trek. Rust helpt je dus ook op de weegschaal.',
    training: 'Voor afvallen: rustige lange ritten verbranden veel en houden je fris voor de volgende dag.',
    kracht: 'Voor afvallen: spieren verbruiken ook in rust energie, en je blijft sterk terwijl je lichter wordt.',
    klim: 'Voor afvallen: elke kilo minder merk je het eerst bergop. Dat is de mooiste beloning.',
    materiaal: 'Voor afvallen: hoe fijner je fiets rijdt, hoe vaker je hem pakt. En elke rit telt.',
    weer: 'Voor afvallen: blijf in beweging, ook als het weer tegenzit. Een rit binnen telt net zo goed.',
    techniek: 'Voor afvallen: rij vaker met anderen mee. Samen haal je makkelijker je ritten.',
    mentaal: 'Voor afvallen: kijk naar je gemiddelde over weken, niet naar één dag. Zo houd je het vol.'
  },
  fit: {
    voeding: 'Voor fit blijven: goed eten op de fiets maakt elke rit leuker, zonder hongerklop.',
    herstel: 'Voor fit blijven: rust hoort erbij. Zo houd je er plezier in.',
    training: 'Voor fit blijven: regelmatig rijden wint van af en toe heel hard.',
    kracht: 'Voor fit blijven: een sterke romp houdt je soepel en je rug blij, ook met de jaren.',
    klim: 'Voor fit blijven: een klim op je eigen tempo is genieten, geen wedstrijd.',
    materiaal: 'Voor fit blijven: een fiets die goed loopt, pak je vaker.',
    weer: 'Voor fit blijven: kies wat fijn voelt. Binnen bij slecht weer is prima, als je maar blijft bewegen.',
    techniek: 'Voor fit blijven: samen rijden is de leukste manier om fit te blijven.',
    mentaal: 'Voor fit blijven met plezier: neem hier mee wat bij je past, zonder druk.'
  }
};
// ctx: { doel: { doel, naam, datum } | null, nu: Date }
export function brugVoor(tip, ctx = {}) {
  const d = ctx.doel; if (!tip || !d || !d.doel) return null;
  const thema = themaVan(tip);
  if (d.doel !== 'evenement') { const b = DOEL_BRUG[d.doel]; return b ? (b[thema] || b.algemeen) : null; }
  const naam = d.naam || 'je tocht';
  const nu = ctx.nu || new Date();
  const nog = d.datum ? Math.ceil((Date.parse(d.datum + 'T08:00:00') - nu.getTime()) / 864e5) : null;
  const fase = faseVan(nog); if (!fase) return null;
  const blok = BRUG[fase];
  const kern = blok[thema] || blok.algemeen || BRUG.basis[thema];
  const minder = MINDER.test((tip.k + ' ' + tip.t).toLowerCase());
  let opener;
  if (fase === 'dag') opener = 'Vandaag is het zover: ' + naam + '!';
  else if (fase === 'na') opener = 'Knap gedaan, ' + naam + ' zit erop.';
  else if (nog == null) opener = minder ? 'Minder trainen in deze periode is prima op weg naar ' + naam + '.' : 'Op weg naar ' + naam + '.';
  else if (minder && (fase === 'basis' || fase === 'opbouw')) opener = 'Minder trainen in deze periode is prima: je hebt nog ' + nog + ' dagen tot ' + naam + '.';
  else opener = 'Nog ' + nog + (nog === 1 ? ' dag' : ' dagen') + ' tot ' + naam + '.';
  const soort = SOORT[tochtSoort(naam)];
  const extra = soort && ['basis', 'opbouw', 'specifiek'].includes(fase) ? soort[thema] : null;
  return [opener, kern, extra].filter(Boolean).join(' ');
}
