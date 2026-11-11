export const DEFAULT_USER = {
  id: 'user_1',
  name: 'Karolek',
  age: 10,
  type: 'child', // child | teen | adult
  goal: 'Poprawa nawyku mowy i codzienne ćwiczenia',
  level: 1,
  points: 0,
  createdAt: new Date().toISOString(),
}

export const LEVELS = [
  { level: 1, label: 'Początkujący',  min: 0,   max: 99  },
  { level: 2, label: 'Ćwiczący',      min: 100,  max: 199 },
  { level: 3, label: 'Zaawansowany',  min: 200,  max: 349 },
  { level: 4, label: 'Ekspert',       min: 350,  max: 549 },
  { level: 5, label: 'Mistrz',        min: 550,  max: Infinity },
]

export function getLevel(points) {
  return LEVELS.find(l => points >= l.min && points <= l.max) || LEVELS[0]
}

export const BADGE_DEFS = [
  { id: 'first_training',  label: 'Pierwszy trening', emoji: '🎯', desc: 'Ukończ pierwsze ćwiczenie' },
  { id: 'full_day',        label: 'Pełny dzień',      emoji: '⭐', desc: '100% wykonania dnia' },
  { id: 'three_trainings', label: '3 treningi',       emoji: '🔥', desc: '3 ukończone ćwiczenia łącznie' },
  { id: 'seven_trainings', label: '7 treningów',      emoji: '🏆', desc: '7 ukończonych ćwiczeń łącznie' },
]

// Domyślne zestawy głoskowe dla Speech Rhythm — każdy zestaw ma własne treści dla 6 poziomów
export const DEFAULT_SOUND_SETS = [
  { id: 'z',  phoneme: 'z' },
  { id: 'dz', phoneme: 'dz' },
  { id: 'dż', phoneme: 'dż' },
  { id: 'd',  phoneme: 'd' },
  { id: 'sz', phoneme: 'sz' },
  { id: 'cz', phoneme: 'cz' },
  { id: 'ż',  phoneme: 'ż' },
  { id: 'sz_s', phoneme: 'sz–s' },
]

// Zestawy, których treść jest PROPOZYCJĄ (ułożoną w listopadzie 2026, nie z kart logopedy).
// Trener pokazuje przy nich informację "do zatwierdzenia przez logopedę".
export const PROPOSED_SET_IDS = ['sz', 'cz', 'ż', 'sz_s']

// ── Gotowe materiały logopedyczne — Etap I-IV ────────────────────────────────
const Z_SHORT = [
  'Zosia zjada zupę.', 'Zuzia ma zegar.', 'Zenek niesie wazon.', 'Zając siedzi za płotem.',
  'Zebra je zieloną trawę.', 'Zosia czyta gazetę.', 'Zuzia zamyka zeszyt.', 'Zbyszek kupił znaczek.',
  'Zegar zadzwonił rano.', 'Zosia znalazła guzik.',
]
const Z_MEDIUM = [
  'Zosia z zapałem rysuje zwierzęta.', 'Zuzia zebrała zielone liście.', 'Zając szybko przebiegł przez zarośla.',
  'W zoo zobaczyliśmy zebrę i żyrafę.', 'Zenek zostawił zeszyt na półce.', 'Złota rybka pływa w przezroczystym akwarium.',
  'Zosia zawiązała różową wstążkę.', 'Na zachodzie słońca niebo zrobiło się złote.',
  'Zuzia i Zosia zbudowały zamek z piasku.', 'Zimą zamarza woda w kałużach.',
]
const Z_ZSOUNDS = [
  'Zosia z Zuzią zwiedzały zoo w Zakopanem.', 'Zbyszek znalazł złoty zegarek za zasłoną.',
  'Zając wyskoczył z zarośli i zniknął za wzgórzem.', 'Zosia zawsze z wielką radością zjada zupę jarzynową.',
  'W zielonym lesie zebraliśmy kosz różnych grzybów.', 'Zuzia zaprosiła Zosię na zabawę z puzzlami.',
  'Na stole stał wazon z żółtymi narcyzami.', 'Zimą dzieci zjeżdżają z wysokiej górki na sankach.',
  'Zegar z kukułką zadzwonił już dziesięć razy.', 'W zoo zobaczyliśmy zabawną zebrę z małym źrebakiem.',
]
const Z_HARDER = [
  'Zosia z Zuzią z zachwytem oglądały zwierzęta w zoo.', 'Zbyszek przywiózł z Zakopanego ozdobny zegar.',
  'Złocisty zachód słońca rozświetlił zamarznięte jezioro.', 'Zuzanna znalazła w zeszycie zagubiony znaczek.',
  'W zacisznym zaułku rosły zielone krzewy i brzozy.', 'Zadowolony Zbyszek zorganizował zabawę z zagadkami.',
  'Zosia z zapałem rozwiązywała wszystkie zadania.', 'Za zielonym wzgórzem znajdowało się małe jezioro.',
  'Zając zbliżył się do zarośli i szybko zniknął.', '',
]
const Z_TWISTERS = [
  'Zuzia z Zosią związały złote wstążki.', 'Zbyszek zniósł ze strychu zniszczony zegar.',
  'Za zasłoną Zosia znalazła złoty znaczek.', 'Zając z zarośli zobaczył zbliżającą się kozę.',
  'Zuzanna z zapałem zliczała zielone guziki.', '', '', '', '', '',
]
const Z_POEM = 'Zosia z Zuzią wczesnym rankiem,\nZwiedzały zoo małym szlakiem.\nZebra, zając i kozica,\nKażde zwierzę je zachwyca.\nZłote słońce zza chmur błyska,\nA Zuzanna głośno piska.'

const DZ_SHORT = [
  'Dzwon dzwoni.', 'Dziadek idzie.', 'Dzik biegnie.', 'Dziecko siedzi.', 'Dziennik leży.',
  'Dzban stoi na stole.', 'Dziewczynka śpiewa.', 'Dziś świeci słońce.', 'Dzwonek zadzwonił.', 'Dzieci się bawią.',
]
const DZ_MEDIUM = [
  'Dziadek podlewa kwiaty w ogrodzie.', 'Dziewczynka niesie dzbanek z wodą.', 'Dzieci jedzą lody na podwórku.',
  'Dzik przebiegł przez drogę.', 'Dzwonek zadzwonił na przerwę.', 'W sadzie dojrzewają brzoskwinie.',
  'Dziś odwiedzimy dziadków.', 'Dziewczynki tańczą na scenie.', 'Dziecko układa puzzle przy stole.',
  'Dziadek opowiada ciekawą historię.',
]
const DZ_ZSOUNDS = [
  'Dziadek i dzieci codziennie chodzą do ogrodu.', 'Dziewczynka trzyma dzbanek i podlewa grządki.',
  'Dzwonek zadzwonił, więc dzieci weszły do klasy.', 'Dzik wyszedł z lasu i przebiegł przez polanę.',
  'Dziś dzieci odwiedziły dziadków na działce.', 'Dziewczynka z radością podziwia dzięcioła.',
  'Dziadek znalazł stary dzwon w stodole.', 'Dzieci codziennie ćwiczą przed przedstawieniem.',
  'Na dziedzińcu bawią się dziewczynki i chłopcy.', 'Dzwony kościelne dźwięczały od rana.',
]
const DZ_HARDER = [
  'Dziadek opowiedział dzieciom legendę o dzielnym rycerzu.', 'Dziewczynka z dzbanuszkiem spacerowała po dziedzińcu.',
  'Dzieci z zaciekawieniem oglądały dzięcioła na drzewie.', 'Na dzikiej łące rosły dzikie róże i dzikie maliny.',
  'Dziś na dziedzińcu odbył się rodzinny festyn.', 'Dziewczynki i chłopcy zgodnie bawili się w berka.',
  'Dziadkowie odwiedzili dzieci w niedzielne popołudnie.', 'Dzwonek zadzwonił dokładnie o dwunastej godzinie.',
  'Dzieci podziwiały ogromny dzwon w wieży.', 'Dzielny podróżnik odwiedził wiele miast i dzielnic.',
]
const DZ_TWISTERS = [
  'Dziadek Dyzio dźwiga duży dzban.', 'Dziewczynka z dzbankiem idzie przez dziedziniec.',
  'Dzwon zadzwonił, gdy dzieci wyszły z domu.', 'Dzikie dziki przebiegły przez dziką dolinę.',
  'Dziadek codziennie odwiedza dzieci na działce.', '', '', '', '', '',
]
const DZ_POEM = 'Dziś dziadek z dziećmi na działce pracuje,\nDzbanek z wodą ostrożnie niesie i pilnuje.\nDzwonek gdzieś dzwoni, dzięcioł stuka w drzewo,\nA dzieci się śmieją, bo jest bardzo wesoło.'

const DZZ_SHORT = [
  'Dżem leży na stole.', 'Dżungla jest zielona.', 'Dżip jedzie drogą.', 'Dżdżownica pełznie po ziemi.',
  'Dżokej jedzie na koniu.', 'Dżem jest truskawkowy.', 'Dżin nie jest dla dzieci.', 'Dżepetto zrobił lalkę.',
  'Dżungla jest gęsta.', 'Dżip zatrzymał się przy lesie.',
]
const DZZ_MEDIUM = [
  'Babcia ugotowała pyszny dżem truskawkowy.', 'Dżokej wygrał ważny wyścig.', 'Dżip przejechał przez błotnistą drogę.',
  'W dżungli mieszkają kolorowe ptaki.', 'Dżdżownica schowała się pod ziemię.', 'Dzieci posmarowały bułki dżemem.',
  'Turysta zwiedzał gorącą dżunglę.', 'Dżokej ostrożnie prowadził konia.', 'Na półce stoją słoiki z dżemem.',
  'Mały dżip wjechał na wzgórze.',
]
const DZZ_ZSOUNDS = [
  'Babcia przygotowała duży garnek dżemu porzeczkowego.', 'Dżip dżentelmena zatrzymał się przy dżungli.',
  'Dżokej Jerzy jechał na dzielnym koniu.', 'W wilgotnej dżungli pełzały długie dżdżownice.',
  'Dzieci z apetytem jadły naleśniki z dżemem.', 'Dżokej i dżentelmen rozmawiali o wyścigach.',
  'Dżip szybko przejechał przez kałuże i błoto.', 'W dżungli słychać było śpiew egzotycznych ptaków.',
  'Babcia codziennie smaży pyszny dżem z truskawek.', 'Dżdżownice pojawiły się po dużym deszczu.',
]
const DZZ_HARDER = [
  'Dżentelmen Jerzy przyjechał dżipem do dżungli.', 'Dżokej Andrzej zwyciężył w dżentelmeńskich zawodach.',
  'Babcia Jadwiga ugotowała dżem z jeżyn i porzeczek.', 'W gorącej dżungli dżip utknął w głębokim błocie.',
  'Dżdżownice i żuki pojawiły się po ulewnym deszczu.', 'Dżokej doskonale dosiadł konia podczas wyścigu.',
  'Dżentelmen podziękował za pyszny dżem malinowy.', 'Dzieci oglądały film o wyprawie do dżungli.',
  'Dżip przejechał przez dżunglę i dotarł do wioski.', 'Babcia z dumą częstowała wszystkich domowym dżemem.',
]
const DZZ_TWISTERS = [
  'Dżokej Jerzy je jeżynowy dżem.', 'Dżentelmen jedzie dżipem przez dżunglę.',
  'Dżdżownica drży po dużym deszczu.', 'Dżip dżentelmena dźwiga duży bagaż.',
  'Babcia Jadwiga gotuje jeżynowy dżem.', '', '', '', '', '',
]
const DZZ_POEM = 'Dżokej Jerzy jedzie w dal,\nDżipem mija gęsty szlak.\nW dżungli śpiewa mały ptak,\nA babcina dżemu smak — ach!'

const D_SHORT = [
  'Damian daje długopis.', 'Dorota domalowała domek.', 'Darek dostał deskę.', 'Danuta doi krowę.',
  'Dominik dmucha balon.', 'Darek dostał medal.', 'Dziecko buduje dom.', 'Dziadek czyta gazetę.',
  'Dorota podlewa kwiaty.', 'Daniel otworzył drzwi.',
]
const D_MEDIUM = [
  'Damian dostał nowy długopis od dziadka.', 'Dorota codziennie podlewa kwiaty w ogrodzie.',
  'Dominik buduje duży domek z klocków.', 'Darek bardzo dobrze gra w piłkę.', 'Dzieci długo spacerowały po lesie.',
  'Danuta upiekła pyszny drożdżowy placek.', 'Dziadek opowiada wnukom ciekawe historie.',
  'Daniel odrabia zadanie domowe.', 'Dorota dekoruje dom na święta.', 'Darek dostał dyplom za dobre wyniki.',
]
const D_ZSOUNDS = [
  'Damian dostał od dziadka drewniany domek.', 'Danuta codziennie dba o porządek w domu.',
  'Darek długo szukał drogi do domu.', 'Dorota dekorowała duży pokój kolorowymi dodatkami.',
  'Dzieci dokładnie posprzątały cały dom.', 'Dziadek z Danielem budowali drewniany domek.',
  'Dominik odnalazł zagubiony długopis pod biurkiem.', 'Darek i Damian codziennie ćwiczą na boisku.',
  'Dorota dostała od rodziców piękny dyplom.', 'Dzieci długo rozmawiały o swoich wakacjach.',
]
const D_HARDER = [
  'Damian dokładnie dopasował drewniane deski do domku.', 'Dorota z dziadkiem długo dekorowali duży pokój.',
  'Dominik odważnie dopłynął do drewnianego pomostu.', 'Dzieci dokładnie odrobiły wszystkie zadania domowe.',
  'Dziadek podarował Danielowi piękny drewniany model statku.', 'Darek z Dorotą długo dyskutowali o podróży.',
  'Danuta przygotowała domowy obiad dla całej rodziny.', 'Damian codziennie dba o porządek w swoim pokoju.',
  'Dzieci z dumą odebrały dyplomy i medale.', 'Dorota i Dominik doskonale poradzili sobie z trudnym zadaniem.',
]
const D_TWISTERS = [
  'Damian dał Dorocie duży długopis.', 'Darek długo dmuchał duży balon.',
  'Dziadek Daniel dźwigał dwie duże deski.', 'Dorota dokładnie dekorowała drewniany domek.',
  'Dominik codziennie doskonali dobrą dykcję.', '', '', '', '', '',
]
const D_POEM = 'Damian dostał dziś od dziadka\nDuży domek oraz statki.\nDumny Daniel dobudował\nDach i drogę dookoła.\nDzień był dobry i radosny,\nDom już gotów – bardzo mocny.'

// ── Propozycje materiału: SZ, CZ, Ż/RZ oraz zestaw kontrastowy ───────────────
// Zasada układu: w "Krótkich zdaniach" nie ma głosek syczących (s, z, c, dz),
// żeby dziecko ćwiczyło samą głoskę szumiącą. Głoski syczące dochodzą stopniowo,
// a w "Trudniejszych" i "Łamańcach" są celowo wymieszane (sz obok s, cz obok c, ż obok z).
const SZ_SHORT = [
  'Szymon ma szalik.', 'Szafa była otwarta.', 'Szpak lubi gruszki.', 'Szymek kupił szelki.',
  'Szary kot pije mleko.', 'Szymon naprawia szufladę.', 'Mama szyje fartuszek.', 'Szymek ma nową koszulę.',
  'Szufelka leży w wiaderku.', 'Szop pracz myje łapki.',
]
const SZ_MEDIUM = [
  'Szymon włożył do szafy ciepły szalik.', 'Babcia uszyła Szymkowi nową koszulę.', 'Szpak wyleciał z gniazda na gruszy.',
  'Myszka schowała się pod szafą.', 'Tomasz maluje szeroki szlak w górach.', 'Na szosie stoi duży szary autobus.',
  'Łukasz szuka w szufladzie nowych kredek.', 'Szymek poszedł z tatą na szachy.', 'W koszyku leżą gruszki i kasza.',
  'Dariusz nosi kapelusz i szelki.',
]
const SZ_ZSOUNDS = [
  'Szymon szuka szalika w szerokiej szafie.', 'Łukasz i Tomasz szybko maszerują po szosie.',
  'Szara myszka szeleści w szuwarach.', 'Nasza Agnieszka szyje szmacianą myszkę.',
  'Szpak szuka pożywienia na szczycie gruszy.', 'Szymek pokazał Dariuszowi szkic szałasu.',
  'W szatni wiszą szaliki, kapelusze i szelki.', 'Mateusz szepcze coś Szymonowi do ucha.',
  'Szef kuchni szykuje szpinak i szaszłyki.', 'Na szlaku szumią drzewa i szeleszczą liście.',
]
const SZ_HARDER = [
  'Szymon z Sabiną spacerowali szeroką szosą.', 'Sasza suszy szalik na słonecznym tarasie.',
  'Staszek szuka w szkole swojego szkicownika.', 'Szósty samochód szybko skręcił w stronę szpitala.',
  'Starszy sąsiad szykuje smaczny szaszłyk.', 'Sonia uszyła sukienkę z szerokim paskiem.',
  'Łukasz serdecznie uściskał swojego szwagra.', 'W szklance została resztka soku z gruszek.',
  'Szymon słyszy szum sosen i szelest liści.', 'Nasz pies Szafir szybko skacze przez strumyk.',
]
const SZ_TWISTERS = [
  'Szymon szyje szary szalik.', 'Szara myszka szuka szyszki.', 'Sasza szuka suszonych gruszek.',
  'Szeroka szosa szumi po deszczu.', 'Staszek słyszy szelest szuwarów.',
]
const SZ_POEM = 'Szymon włożył szary szalik,\nSzedł przez szosę do Natalii.\nSzumią drzewa, szepcze las,\nNa szarlotkę przyszedł czas.'

const CZ_SHORT = [
  'Czarek ma czapkę.', 'Czajnik już gwiżdże.', 'Czarny kot goni motyla.', 'Czesiek czyta bajkę.',
  'Babcia piecze bułeczki.', 'Czekolada leży na półce.', 'Tata ma klucze.', 'Kaczka pływa po wodzie.',
  'Uczeń czeka na tramwaj.', 'Paczka leży pod drzwiami.',
]
const CZ_MEDIUM = [
  'Czarek założył ciepłą czapkę i rękawiczki.', 'Mama nalała herbatę z czajnika.', 'Na łące fruwają pszczoły i biedroneczki.',
  'Uczeń czyta wieczorem ciekawą książkę.', 'Kaczka z kaczętami płynie po rzece.', 'Tata otworzył drzwi dużym kluczem.',
  'Czesia poczęstowała gości czekoladą.', 'W czwartek pojedziemy na wycieczkę.', 'Maciek kupił paczkę czerwonych porzeczek.',
  'Wieczorem oglądamy mecz piłki ręcznej.',
]
const CZ_ZSOUNDS = [
  'Czarek czeka na czwartkową wycieczkę.', 'Czesia częstuje uczniów czekoladowymi ciasteczkami.',
  'Czarna kaczka kroczy po czystej rzeczce.', 'Uczeń czyta czytankę o czterech pszczołach.',
  'Wieczorem Czarek czyści czarne buty.', 'W paczce leżą klucze, haczyki i pieczątki.',
  'Nauczyciel tłumaczy uczniom trudne zadanie.', 'Czesiek liczy czerwone guziczki w pudełeczku.',
  'Na poczcie czeka paczka dla Czarka.', 'Czapla czujnie patrzy na rzeczkę.',
]
const CZ_HARDER = [
  'Cezary czeka na Cecylię przed czytelnią.', 'Czarek z ciocią Celiną piecze czekoladowe ciasto.',
  'Chłopiec czyści cały czajnik do czysta.', 'Co wieczór Czesia czyta cztery strony książki.',
  'Uczniowie liczą cegły na placu budowy.', 'Czujny owczarek pilnuje owiec na hali.',
  'Cyrkowiec w czarnej czapce żongluje piłeczkami.', 'Ojciec tłumaczy Czarkowi trudną lekcję.',
  'Na tacy leżą cukierki, czekolada i orzeszki.', 'Ciemna noc otuliła czyste, czarne niebo.',
]
const CZ_TWISTERS = [
  'Czarek czyści czarny czajnik.', 'Cztery kaczki kroczą po rzeczce.', 'Czesia częstuje ciocię czekoladą.',
  'Cezary liczy czerwone cegły.', 'Uczeń uczy się czytać czytankę.',
]
const CZ_POEM = 'Czarek czapkę ma czerwoną,\nCzesia – w paski, lecz zieloną.\nCzwartek, wieczór, czas na mecz,\nCzekolada – dobra rzecz!'

const ZH_SHORT = [
  'Żaba żyje w wodzie.', 'Żaneta ma żółty balon.', 'Rzeka płynie powoli.', 'Żuk idzie po trawie.',
  'Żyrafa je liście.', 'Jeże lubią jabłka.', 'Żółw wędruje powoli.', 'Marzena maluje morze.',
  'Burza nadchodzi nad pole.', 'Żaglówka płynie po wodzie.',
]
const ZH_MEDIUM = [
  'Żaneta narysowała żółtą żyrafę.', 'Na brzegu rzeki rosną wierzby.', 'Żuk powoli wędruje po dużym liściu.',
  'Marzena jeździ na rowerze po podwórku.', 'Żółw schował głowę do skorupy.', 'Grzegorz przyniósł z ogrodu warzywa.',
  'Wieczorem żaby głośno rechoczą nad rzeką.', 'Rzemieślnik naprawia drewniane krzesło.', 'Bożena położyła książki na biurku.',
  'Po burzy na niebie pojawiła się tęcza.',
]
const ZH_ZSOUNDS = [
  'Żaneta i Bożena żeglują po dużej rzece.', 'Żółta żyrafa żuje liście z drzewa.',
  'Żuk i żaba żyją nad brzegiem rzeki.', 'Marzena marzy o podróży nad morze.',
  'Grzegorz jeździ rowerem po leśnej drodze.', 'Na wieży leży żelazny, ciężki dzwon.',
  'Żołnierze maszerują drogą wzdłuż rzeki.', 'Rzodkiewki i jarzyny rosną w ogrodzie Bożeny.',
  'Żaneta pożyczyła Marzenie żółtą parasolkę.', 'Jeże i żółwie wędrują po zielonej łące.',
]
const ZH_HARDER = [
  'Zuzia i Żaneta zbierają żołędzie w lesie.', 'Zenek zobaczył żabę za dużym kamieniem.',
  'Żółta róża zakwitła w zielonym ogrodzie.', 'Bożena zawiozła warzywa na zamek.',
  'Zimą rzeka zamarza, a żaby zasypiają.', 'Grzegorz zgubił zeszyt z rysunkiem żyrafy.',
  'Żołnierz zdjął z wieży zardzewiały zegar.', 'Marzena z zapałem układa puzzle z żaglowcem.',
  'Zając i jeż założyli się, kto zdąży pierwszy.', 'Zza wzgórza nadciąga burza z błyskawicami.',
]
const ZH_TWISTERS = [
  'Żółta żaba żuje żurawinę.', 'Żaneta żegna żeglarzy na rzece.', 'Zuzia rysuje żyrafę i zebrę.',
  'Rzeka rzeźbi brzeg po burzy.', 'Żuk zobaczył żabę za rzodkiewką.',
]
const ZH_POEM = 'Żaba z żukiem nad rzeką siedzą,\nŻe burza idzie – jeszcze nie wiedzą.\nŻółw im powiedział: „Już grzmi za wzgórzem!”\nSchowali się wszyscy pod liściem dużym.'

// Zestaw kontrastowy: pary i zdania, w których głoska szumiąca stoi obok syczącej.
// To materiał do nauki RÓŻNICY (soczek, nie socek) — najbliższy celowi rodziny.
const MIX_SHORT = [
  'kasa, kasza.', 'sok, szok.', 'kos, kosz.', 'nas, nasz.', 'sum, szum.',
  'syna, szyna.', 'stuka, sztuka.', 'sale, szale.', 'plus, plusz.', 'wąs, wąż.',
]
const MIX_MEDIUM = [
  'płace, płacze.', 'prace, pracze.', 'tacka, taczka.', 'packa, paczka.', 'lec, lecz.',
  'piec, piecz.', 'cech, Czech.', 'zebra, żebra.', 'zona, żona.',
]
const MIX_ZSOUNDS = [
  'Szymon pije sok, a Sabina je kaszę.', 'W kasie kupiłem kaszę i soczek.', 'Nasz kos usiadł na koszu.',
  'Sum pływa, a las szumi.', 'Syn patrzy na szynę tramwajową.', 'Tacka leży na taczce.',
  'Paczka czeka na poczcie od nocy.', 'Żona Zenona rysuje zebrę.', 'Zebra ma żebra, a żyrafa ma szyję.',
  'Sasza włożył szalik i czapkę.',
]
const MIX_HARDER = [
  'Soczek stoi na stoliczku.', 'Słoneczko świeci nad szosą.', 'Staszek suszy czapeczkę.',
  'Szymon sączy soczek przez słomkę.', 'Samochodzik szybko skręcił.', 'Serniczek smakuje Czarkowi.',
  'Sześć szklanek stoi na szafce.', 'Czemu Szymon się spóźnił?', 'Zosia pożyczyła Zuzi zeszyt.',
  'Cezary sprzedaje czasopisma.',
]
const MIX_TWISTERS = [
  'Soczek, szalik, sanki, szafa.', 'Czapka, cebula, czajnik, cukier.', 'Żaba, zebra, żuk, zegar.',
  'Staszek sączy słodki soczek.', 'Cztery cytryny, sześć szyszek.',
]
const MIX_POEM = 'Soczek stoi na stoliczku,\nSzalik wisi na haczyku.\nCzapka czeka, sanki też –\nMów wyraźnie, jeśli chcesz!'

// Treść nowych zestawów pod kluczami używanymi przez trenera i ćwiczenie
const ADDED_CONTENT = {
  content_sz_short_lines: SZ_SHORT, content_sz_medium_lines: SZ_MEDIUM, content_sz_zsounds_lines: SZ_ZSOUNDS,
  content_sz_harder_lines: SZ_HARDER, content_sz_twisters_lines: SZ_TWISTERS, content_sz_poem_text: SZ_POEM,

  content_cz_short_lines: CZ_SHORT, content_cz_medium_lines: CZ_MEDIUM, content_cz_zsounds_lines: CZ_ZSOUNDS,
  content_cz_harder_lines: CZ_HARDER, content_cz_twisters_lines: CZ_TWISTERS, content_cz_poem_text: CZ_POEM,

  'content_ż_short_lines': ZH_SHORT, 'content_ż_medium_lines': ZH_MEDIUM, 'content_ż_zsounds_lines': ZH_ZSOUNDS,
  'content_ż_harder_lines': ZH_HARDER, 'content_ż_twisters_lines': ZH_TWISTERS, 'content_ż_poem_text': ZH_POEM,

  content_sz_s_short_lines: MIX_SHORT, content_sz_s_medium_lines: MIX_MEDIUM, content_sz_s_zsounds_lines: MIX_ZSOUNDS,
  content_sz_s_harder_lines: MIX_HARDER, content_sz_s_twisters_lines: MIX_TWISTERS, content_sz_s_poem_text: MIX_POEM,
}

// ── Migracja zapisanych ćwiczeń ──────────────────────────────────────────────
// Ćwiczenia są trwale zapisane w przeglądarce (stc_exercises), więc nowe zestawy z kodu
// same się tam nie pojawią. Ta funkcja dopisuje brakujące zestawy i treść TYLKO tam,
// gdzie pole jest puste — niczego, co wpisał trener, nie nadpisuje.
export function migrateExercises(exercises) {
  let changed = false
  const next = (exercises || []).map(ex => {
    if (ex.module !== 'speech_rhythm') return ex
    const params = { ...(ex.params || {}) }
    let sets = params.soundSets || DEFAULT_SOUND_SETS
    let exChanged = false
    for (const def of DEFAULT_SOUND_SETS) {
      if (!sets.some(s => s.id === def.id)) { sets = [...sets, def]; exChanged = true }
    }
    for (const [key, value] of Object.entries(ADDED_CONTENT)) {
      const cur = params[key]
      const empty = cur == null || (Array.isArray(cur) ? cur.every(x => !x || !String(x).trim()) : !String(cur).trim())
      if (empty) { params[key] = value; exChanged = true }
    }
    if (!exChanged) return ex
    changed = true
    return { ...ex, params: { ...params, soundSets: sets } }
  })
  return changed ? next : exercises
}

export const DEFAULT_EXERCISES = [
  {
    id: 'ex_1',
    name: 'Tongue Up Position',
    module: 'tongue_position',
    schedule: [],
    duration: 2,
    points: 10,
    instruction: 'Przez chwilę skup się na spokojnym utrzymaniu prawidłowej pozycji języka. Unieś czubek języka ku górze podniebienia i utrzymaj przez 5 sekund. Ćwicz dokładnie, bez pośpiechu.',
    alarmEnabled: true,
    alarmAdvanceSec: 30,
    alarmSound: 'phone',
    visionEnabled: false,
  },
  {
    id: 'ex_2',
    name: 'SZ Lip Shape',
    module: 'sz_lip',
    schedule: [],
    duration: 3,
    points: 10,
    instruction: 'Ułóż usta w lekki dzióbek i powtórz spokojnie: sza, sze, szo, szu. Zwróć uwagę, żeby nie spłaszczać ust. Powtórz 5 razy w spokojnym rytmie.',
    alarmEnabled: true,
    alarmAdvanceSec: 30,
    alarmSound: 'phone',
    visionEnabled: false,
    params: {
      wordSets: [
        { id: 0, words: 'sza, sze, szo, szu' },
        { id: 1, words: '' }, { id: 2, words: '' }, { id: 3, words: '' },
        { id: 4, words: '' }, { id: 5, words: '' }, { id: 6, words: '' },
        { id: 7, words: '' }, { id: 8, words: '' }, { id: 9, words: '' },
      ],
      speechRate: 0.3,
      gapSec: 0.4,
      reps: 5,
      pitch: 1.2,
    },
  },
  {
    id: 'ex_3',
    name: 'Speech Rhythm',
    module: 'speech_rhythm',
    schedule: [],
    duration: 3,
    points: 10,
    instruction: 'Mów powoli i równo. Powtórz słowa lub sylaby w spokojnym rytmie. Podczas wymawiania początku wyrazów otwieraj usta i w słowach tego wymagających rób dzióbek. Pilnujemy języka!!! (Język nie może wychodzić poza zęby).',
    alarmEnabled: true,
    alarmAdvanceSec: 30,
    alarmSound: 'phone',
    visionEnabled: false,
    params: {
      soundSets: DEFAULT_SOUND_SETS,
      activeSetId: 'z',
      activeLevel: 'short',
      activePhoneme: 'z',
      narratorRate: 0.3,
      pauseSec: 0.4,
      commaPause: 0.2,
      periodPause: 0.4,

      content_z_short_lines:    Z_SHORT,
      content_z_medium_lines:   Z_MEDIUM,
      content_z_zsounds_lines:  Z_ZSOUNDS,
      content_z_harder_lines:   Z_HARDER,
      content_z_twisters_lines: Z_TWISTERS,
      content_z_poem_text:      Z_POEM,

      content_dz_short_lines:    DZ_SHORT,
      content_dz_medium_lines:   DZ_MEDIUM,
      content_dz_zsounds_lines:  DZ_ZSOUNDS,
      content_dz_harder_lines:   DZ_HARDER,
      content_dz_twisters_lines: DZ_TWISTERS,
      content_dz_poem_text:      DZ_POEM,

      'content_dż_short_lines':    DZZ_SHORT,
      'content_dż_medium_lines':   DZZ_MEDIUM,
      'content_dż_zsounds_lines':  DZZ_ZSOUNDS,
      'content_dż_harder_lines':   DZZ_HARDER,
      'content_dż_twisters_lines': DZZ_TWISTERS,
      'content_dż_poem_text':      DZZ_POEM,

      content_d_short_lines:    D_SHORT,
      content_d_medium_lines:   D_MEDIUM,
      content_d_zsounds_lines:  D_ZSOUNDS,
      content_d_harder_lines:   D_HARDER,
      content_d_twisters_lines: D_TWISTERS,
      content_d_poem_text:      D_POEM,

      ...ADDED_CONTENT,

      sentenceList: Z_SHORT,
      sentences: Z_SHORT.join(' '),
    },
  },
  {
    id: 'ex_4',
    name: 'Mechanical Tongue Trainer',
    module: 'mechanical',
    schedule: [],
    duration: 10,
    points: 20,
    instruction: 'Przygotuj urządzenie mechaniczne i wykonaj zaplanowany trening. Postępuj zgodnie z instrukcją urządzenia. Po zakończeniu oznacz ćwiczenie jako wykonane.',
    alarmEnabled: true,
    alarmAdvanceSec: 30,
    alarmSound: 'phone',
    visionEnabled: false,
  },
  {
    id: 'ex_5',
    name: 'Froggy Mouth',
    module: 'froggy_mouth',
    schedule: [],
    duration: 10,
    points: 20,
    instruction: 'Załóż wkładkę doustną Froggy Mouth i wykonaj zaplanowany trening zgodnie z instrukcją urządzenia. Po zakończeniu oznacz ćwiczenie jako wykonane.',
    alarmEnabled: true,
    alarmAdvanceSec: 30,
    alarmSound: 'phone',
    visionEnabled: false,
  },
]

// ── Generowanie planu dnia z szablonów ćwiczeń ───────────────────────────────
function deriveListFromParams(p = {}) {
  const setId = p.activeSetId
  const level = p.activeLevel || 'short'
  if (!setId) return []
  if (level === 'poem') {
    const text = p[`content_${setId}_poem_text`] || ''
    return text.split('\n').map(s => s.trim()).filter(Boolean)
  }
  const lines = p[`content_${setId}_${level}_lines`] || []
  return lines.filter(Boolean)
}

export function getDayIdx() {
  const js = new Date().getDay() // 0=Sun
  return js === 0 ? 6 : js - 1  // 0=Pon, 6=Nd
}

export function generateTodayPlan(exercises) {
  const dayIdx = getDayIdx()
  const instances = []
  ;(exercises || []).forEach(ex => {
    const slots = (ex.schedule || [])
      .filter(s => s.day === dayIdx)
      .sort((a, b) => a.hour.localeCompare(b.hour))
    slots.forEach(slot => {
      let params = { ...(ex.params || {}) }

      // SZ Lip: per-slot words override (stary format) lub wybór zestawu (nowy format)
      if (ex.module === 'sz_lip') {
        if (slot.words) {
          params = { ...params, words: slot.words } // backward compat
        } else if (slot.setIdx != null) {
          const wordSets = ex.params?.wordSets || []
          const selectedSet = wordSets[slot.setIdx]
          if (selectedSet?.words) params = { ...params, words: selectedSet.words }
        }
      }

      // Speech Rhythm: per-slot głoska/poziom + re-derive sentenceList
      if (ex.module === 'speech_rhythm' && slot.activeSetId) {
        params = {
          ...params,
          activeSetId:   slot.activeSetId,
          activeLevel:   slot.activeLevel   || params.activeLevel   || 'short',
          activePhoneme: slot.activePhoneme || params.activePhoneme || '',
        }
        const list = deriveListFromParams(params)
        params = { ...params, sentenceList: list, sentences: list.join(' ') }
      }

      instances.push({
        ...ex,
        id: `${ex.id}_${slot.hour.replace(':', '')}`,
        templateId: ex.id,
        hour: slot.hour,
        status: 'planned',
        params,
      })
    })
  })
  return instances
}

export const MODULES = [
  {
    id: 'mechanical',
    name: 'Mechanical Tongue Trainer',
    emoji: '⚙️',
    desc: 'Trening precyzji i stabilności języka z urządzeniem mechanicznym',
    available: true,
    future: ['Stability', 'Precision', 'Reaction'],
    requiresDevice: true,
    minAge: null,
  },
  {
    id: 'froggy_mouth',
    name: 'Froggy Mouth',
    emoji: '🐸',
    desc: 'Trening z wkładką doustną Froggy Mouth',
    available: true,
    future: [],
    requiresDevice: true,
    minAge: null,
  },
  {
    id: 'sz_lip',
    name: 'SZ Lip Shape',
    emoji: '👄',
    desc: 'Trening dzióbka i wymowy głosek sz, cz, dż',
    available: true,
    future: ['Wizualizacja dodana, mikrofon jeszcze nie'],
    requiresDevice: false,
    minAge: null,
  },
  {
    id: 'speech_rhythm',
    name: 'Speech Rhythm',
    emoji: '🎵',
    desc: 'Trening rytmu i tempa mowy z zestawami głoskowymi (Z, DZ, DŻ, D)',
    available: true,
    future: ['Analiza mikrofonu'],
    requiresDevice: false,
    minAge: null,
  },
  {
    id: 'tongue_position',
    name: 'Tongue Up Position',
    emoji: '👅',
    desc: 'Trening prawidłowej pozycji spoczynkowej języka',
    available: true,
    future: ['Analiza kamery'],
    requiresDevice: false,
    minAge: null,
  },
  {
    id: 'closed_mouth',
    name: 'Closed-Mouth Tongue Movement',
    emoji: '🔒',
    desc: 'Trening ruchów języka przy zamkniętych ustach',
    available: false,
    future: ['Analiza kamery'],
    requiresDevice: false,
    minAge: null,
  },
  {
    id: 'open_mouth',
    name: 'Open-Mouth Tongue Movement',
    emoji: '😮',
    desc: 'Trening ruchów języka przy otwartych ustach',
    available: false,
    future: ['Analiza kamery'],
    requiresDevice: false,
    minAge: null,
  },
  {
    id: 'face_muscle',
    name: 'Face Muscle Training',
    emoji: '💪',
    desc: 'Trening mięśni twarzy — zalecany dla użytkowników 13+',
    available: false,
    future: ['Analiza kamery'],
    requiresDevice: false,
    minAge: 13,
  },
]

export function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

// ── Etykieta wyświetlana dla Speech Rhythm: nazwa + głoska + poziom ──────────
const RHYTHM_LEVEL_LABELS = {
  short:    'Krótkie zdania',
  medium:   'Zdania średniej długości',
  zsounds:  'Zdania z dużą liczbą głosek',
  harder:   'Trudniejsze zdania logopedyczne',
  twisters: 'Łamańce językowe',
  poem:     'Wierszyk',
}

export function speechRhythmLabel(ex) {
  if (ex.module !== 'speech_rhythm') return ex.name
  const sets    = ex.params?.soundSets || DEFAULT_SOUND_SETS
  const set     = sets.find(s => s.id === ex.params?.activeSetId) || sets[0]
  const phoneme = set?.phoneme || '?'
  const levelId = ex.params?.activeLevel || 'short'
  const levelLabel = RHYTHM_LEVEL_LABELS[levelId] || levelId
  return `Speech Rhythm – głoska „${phoneme}” – ${levelLabel}`
}

export function calcDayStats(plan) {
  const total     = plan.length
  const completed = plan.filter(e => e.status === 'completed').length
  const skipped   = plan.filter(e => e.status === 'skipped').length
  const cancelled = plan.filter(e => e.status === 'cancelled').length
  const missed    = plan.filter(e => e.status === 'missed').length
  const minutes   = plan.filter(e => e.status === 'completed').reduce((s, e) => s + e.duration, 0)
  const pct       = total ? Math.round((completed / total) * 100) : 0
  return { total, completed, skipped, cancelled, missed, minutes, pct }
}
