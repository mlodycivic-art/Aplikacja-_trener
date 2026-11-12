# Karolek – mowa: plan rozwoju aplikacji

Stan na 11 listopada 2026. Ten plik jest źródłem prawdy o tym, co jest zrobione, co czeka
i od czego zależy. Aktualizujemy go przy każdym pakiecie zmian.

## Cel

Karolek umie powiedzieć „soczek”, gdy się pilnuje, ale w swobodnej mowie wraca do „socek”.
Ma obniżone napięcie mięśniowe, a język w spoczynku i we śnie leży pośrodku lub na dole.
Aplikacja ma więc dwa tory:

1. **Nawyk w mowie** — przenieść poprawną wymowę sz/cz/ż/dż do zwykłej rozmowy.
2. **Pozycja spoczynkowa** — język u góry przy zamkniętych ustach, także bez pilnowania.

Główna miara postępu: **% poprawnych głosek w 2-minutowej próbce swobodnej mowy** (panel rodzica).

## Zrobione (11.11.2026)

| Pakiet | Co | Gdzie w kodzie | Stan testów |
|---|---|---|---|
| 1 | Test SZ: pomiar szumu głoski (s/c wysoko, sz/cz nisko), nagrywanie par, eksport wyników | `src/screens/SibilantTestScreen.jsx`, `src/screens/games/useSibilantMeter.js` | logika testami; **mikrofon z Karolkiem — do zrobienia** |
| 2 | Zdania sz, cz, ż + zestaw kontrastowy „sz–s” w 6 poziomach | `src/data/defaultData.js` (`ADDED_CONTENT`, `migrateExercises`) | **treść do zatwierdzenia przez logopedkę** |
| 3 | Nowy wygląd (Wariant A), dwie strefy z PIN-em, karta „Teraz” | `src/styles/main.css`, `src/App.jsx`, `src/components/NavBar.jsx`, `PinGate.jsx`, `Icon.jsx`, `src/screens/TodayScreen.jsx` | przeglądarka testowa |
| 4 | Wspólny magazyn wyników | `src/data/resultsStore.js` | przeglądarka testowa |
| 4 | Ćwiczenie „Mowa mieszana” z odsłuchem i samooceną | `src/screens/MixSpeechExercise.jsx` | przeglądarka testowa (sztuczny mikrofon) |
| 4 | „Gdzie jest język?” — losowe sprawdzenia w ciągu dnia | `src/components/TongueCheck.jsx` | przeglądarka testowa |
| 4 | Panel rodzica: próbka tygodniowa, dziennik nocny, statystyki | `src/screens/ParentExtras.jsx` | przeglądarka testowa |
| 5 | Gra Balon do SZ Lip Shape (kamera, bez podglądu twarzy) | `src/screens/games/BalloonGame.jsx`, `src/screens/vision/useFaceEngine.js` | tylko tryb testowy bez kamery; **na twarzy — do zrobienia** |
| 5 | Kręgle: nowa animacja, dźwięk, tabliczka wyników sesji | `src/screens/games/BowlingReward.jsx`, `playGameSound` w `useAlarm.js` | przeglądarka testowa |
| 6 | Daty wg czasu lokalnego (plan zmienia się o północy, nie o 1:00), automatyczne wczytanie nowego dnia | `src/App.jsx`, `todayKey` w `defaultData.js` | przeglądarka testowa |
| 6 | Raport tygodniowy z 7 dni (ćwiczenia, próbka mowy, noce, sprawdzenia, gry) | `src/data/weekReport.js`, `src/screens/ParentScreen.jsx` | przeglądarka testowa |
| 6 | Kopia zapasowa: zapis i przywracanie wszystkich danych jednym plikiem | `src/data/backup.js` | przeglądarka testowa (zapis + przywrócenie) |
| 6 | Ekran Postępy (seria dni, tydzień, rekordy) zamiast Nagród; usunięte emoji i pastelowe karty | `src/screens/RewardsScreen.jsx` i pozostałe ekrany | przeglądarka testowa |
| 7 | Baza wzorców mikrofonu: trwałe nagrania par, akceptacja logopedy, osobisty próg | `src/screens/PatternBaseScreen.jsx`, `src/data/patternStore.js` | logika testami; **nagrania z Karolkiem — do zrobienia** |
| 7 | Punkty zależne od wyniku (kręgle, balon, mowa mieszana, sprawdzenia języka) | `src/data/points.js` | testy logiki |
| 7 | Instalacja na ekranie głównym: manifest i ikony (bez pracy offline) | `public/`, `index.html` | manifest wczytuje się; **instalacja na tablecie — do sprawdzenia** |
| 8 | Kalibracja mikrofonu w minutę (długie „ssss” i „szszsz”) → próg dla gier | `src/screens/QuickMicCalibration.jsx`, `computeQuickProfile` w `patternStore.js` | testy logiki; **prawdziwy głos — do zrobienia** |
| 8 | Ocena wypowiedzi z tekstu: jakie głoski powinny paść i czy padły, trzy tolerancje | `src/data/sibilants.js` | testy logiki na danych sztucznych |
| 8 | Gra Bańki (słowa lub zdania z Trenera, czas gry, tolerancja; tryb oceny i tryb treningowy) | `src/screens/games/BubbleGame.jsx`, `GAME_WORDS` w `defaultData.js` | przeglądarka testowa w trybie testowym; **mikrofon — do zrobienia** |
| 8 | Osobista kalibracja ust (spoczynek + dzióbek) i poziom dzióbka względem własnego zakresu | `src/screens/vision/QuickFaceCalibration.jsx`, `src/data/faceProfile.js` | **nieuruchamiane na twarzy** |
| 8 | Ćwiczenie „Język za zamkniętymi ustami” (policzki, okrążenia; kamera pilnuje zamkniętych ust i zbiera dane o policzkach) | `src/screens/TongueClosedExercise.jsx` | przeglądarka testowa bez kamery |
| 8 | Skiny: Nowoczesny, Futurystyczny, Arena, Aurora, Studio + 9 akcentów | `src/data/theme.js`, `src/components/ThemePicker.jsx`, `main.css` | przeglądarka testowa (wszystkie skiny) |
| 9 | Mapa ust: 9 pozycji (mmm, aaa, iii, uuu, szszsz, policzki, język pod wargami), ~47 miar, wzorce osoby, test trafności | `src/data/faceMap.js`, `src/screens/vision/FaceMapCalibration.jsx`, `useMouthControl.js` | testy na danych sztucznych; **na twarzy — do zrobienia** |
| 9 | Gra Auto (policzki sterują, monety na przemian po obu stronach) | `src/screens/games/CarGame.jsx` | tryb testowy z klawiatury |
| 9 | Gra Sejf (język prowadzi znacznik pokrętła do rowka, stała prędkość, poślizg przy pośpiechu) | `src/screens/games/SafeGame.jsx` | tryb testowy z klawiatury |
| 9 | Kalibracja mikrofonu: sylaby (sa, sza, su, szu, ca, cza, cy, czy) i test trafności na 6 słowach | `src/screens/QuickMicCalibration.jsx`, `games/utterance.js` | tylko budowanie; **prawdziwy głos — do zrobienia** |
| 9 | Grafika z oświetleniem (cienie, połysk, gradienty): kręgle, balon, auto, sejf | pliki gier | przeglądarka testowa |
| 10 | Płynny ruch w grach (narastanie i wygaszanie prędkości w Aucie i Sejfie, łuk punktu-przewodnika) | pliki gier | tryb testowy |
| 10 | Kontrola stanowiska przed kalibracją i grami z kamerą: kadr, odległość (z tęczówki), głowa, wysokość telefonu, światło, stabilność, pion; porównanie z warunkami z kalibracji | `src/data/setupCheck.js`, `src/screens/vision/SetupCheck.jsx` | testy na sztucznej twarzy; **kierunek „za nisko / za wysoko” i światło do sprawdzenia na urządzeniu** |

PIN strefy dorosłego: `1234` (testowy, `src/components/PinGate.jsx`).

## Pakiet 11 (12.11.2026): okno starannej mowy i baza własnych słów

Zrobione, sprawdzone tylko na mowie syntetycznej (bez prawdziwego głosu):

- **Staranna mowa** (ćwiczenie `careful_speech`, `CarefulSpeechWindow.jsx`): okno 5–30 min z harmonogramu, licznik,
  blokada wygaszania ekranu, głosowe podsumowanie co kilka minut i na końcu (`data/voice.js`), wynik w `careful_window`,
  karta w panelu Rodzic. Nie przerywa i nie pika w trakcie.
- **Baza własnych słów** (Mikrofon → Słowa, `WordBaseScreen.jsx`, `data/wordBase.js`): lista startowa 40 słów
  (30 włączonych: „sz” i „cz”; 10 z „ż / rz” wyłączonych), własne słowa, nagranie 3× na słowo, test trafności
  w zdaniach, wzorzec proporcji głosek szumiących.
- **Wyłapywanie słów bez rozpoznawania mowy** (`data/wordSpotter.js`): kształt słowa w 11 pasmach + dopasowanie DTW;
  kształt nie rozróżnia „s” od „sz”, więc wzorzec „czemu” znajduje też „cemu”, a głoskę ocenia miernik szumu.
  Test trafności dostraja progi i dopisuje wzorce „słowo w zdaniu”; słowa poniżej 2/3 trafień są wyłączane.

Wynik na mowie syntetycznej (30 słów, zdania nieużyte do strojenia): monitorowanych 17–23 słów z 30;
znalezione 85% wystąpień; ocena błędna w 4 przypadkach na 82 ocenione; 0–1 fałszywe trafienie na 6 zdań bez słów z listy.
Na prawdziwym głosie dziecka te liczby będą inne i trzeba je zmierzyć testem trafności w aplikacji.

**Rdzeń słowa (odmiany bez dopisywania):** przełącznik przy słowie „rdzeń / całe”. W trybie „rdzeń” wzorzec jest
dopasowywany bez ostatniej sylaby („szkoł|a”, „socz|ek”), więc łapie też „szkoły”, „soczku”. Domyślnie rdzeń dla słów
odmiennych z listy startowej; całe słowo dla nieodmiennych i z wymianą głoski („muszę” / „musisz”) oraz dla własnych
słów krótszych niż 3 sylaby. Test trafności w trybie „rdzeń” ma jedno zdanie z odmianą.
Na mowie syntetycznej: odmiany nieużyte w teście znalezione w 23 z 38 przypadków (całe słowa: 4 z 38),
formy podstawowe bez zmian, 1 fałszywe trafienie na 12 zdań bez słów z listy (całe słowa: 0).

Znane ograniczenia: liczy każdy głos przy mikrofonie;
strona musi być na ekranie (wygaszony ekran wstrzymuje pomiar); mikrofon z 2 m niesprawdzony; słowa podobne brzmieniowo
(„pokoju” / „pokaż”) mogą dać fałszywe trafienie.

Dalej: rozpoznanie głosu dziecka po wysokości (pomijanie dorosłych), formy odmienione słów, „odcisk fali” dla głosek zniekształconych.

## Kolejka — w tej kolejności

1. **Test SZ z Karolkiem** na docelowym urządzeniu → wyniki do rozmowy → decyzja, czy pomiar działa.
2. **Balon na prawdziwej twarzy**: sprawdzić progi dzióbka (dziś z profilu wiekowego, nie osobiste),
   zachowanie przy utracie kadru, wygodę czasu trzymania.
3. **Nagranie bazy wzorców z logopedką** (ekran gotowy: strefa dorosłego → Mikrofon → Baza wzorców).
   Minimum 3 zaakceptowane nagrania poprawne i 3 błędne, z różnych słów.
4. **Automatyczna ocena w „Mowie mieszanej”** — dopiero po punkcie 3. Każda próba zapisuje już pomiar `cog`
   i (gdy jest pewny próg) pole `heard`; najpierw porównujemy je z samooceną, potem pokazujemy dziecku.
5. **Mikrofon w Balonie** — warunek „słychać sz podczas dzióbka” (miejsce oznaczone `[MIKROFON]`).
6. **Osobiste progi kamery**: kalibracja zapisuje dziś tylko status; dopisać pomiary zaakceptowanych prób.
7. **Praca bez internetu** (model kamery lokalnie, pamięć podręczna aplikacji).
8. **Wystawienie aplikacji pod adresem https**, żeby dało się ją zainstalować na tablecie spoza sieci domowej.
9. **Tempo mowy**: pomiar sylab na sekundę i nagradzanie spokojnego tempa w Speech Rhythm.
10. **Wykrywanie wypchniętego policzka z kamery**: ćwiczenie „Język za zamkniętymi ustami” zapisuje już
    średnie położenie punktów policzków (`cheekFeatures` w wynikach). Po kilku sesjach sprawdzić, czy lewa
    i prawa strona różnią się wystarczająco, i dopiero wtedy budować detektor.
11. **Kalibracja, która uczy się osoby**: aktualizować próg mikrofonu i profil ust z prób ocenionych
    jako pewne (dziś progi zmienia tylko ponowna kalibracja).
12. **Po teście Mapy ust na twarzy**: jeśli trafność pozycji języka pod wargami jest poniżej 80%, zmienić
    sterowanie Sejfu (np. tylko dwa policzki jako „lewo / prawo”) albo dodać pozycje pośrednie do kalibracji.
13. **Balon i „Język za zamkniętymi ustami” przenieść na Mapę ust** (dziś używają prostszego profilu ust).
14. **Sprawdzić ocenę „ż / rz" i głosek ciszących (ś, ć)** na nagraniach: miernik słyszy pewnie tylko sz, cz, s, c.

## Systemy wizyjne — plan

| System | Co mierzy | Po co | Zależność |
|---|---|---|---|
| Dzióbek (jest) | zwężenie ust i otwór | SZ Lip Shape, Balon | osobiste progi (kolejka 6) |
| Zamknięte usta w tle | % czasu z zamkniętymi ustami podczas gry / bajki | pośredni wskaźnik pozycji spoczynkowej | `checkMouthClosed` już istnieje; potrzebny tryb pracy w tle |
| Postawa | pozycja głowy i barków | przypomnienie o wyprostowaniu przy ćwiczeniu | nowy model (MediaPipe Pose), testy na osobie |
| Język między zębami | wysunięcie języka przy „d” | zalecenie „Pilnujemy języka” | do sprawdzenia, czy kamera to w ogóle widzi |

Kamera nie widzi pozycji języka przy zamkniętych ustach. Do tego służą dziennik nocny i „Gdzie jest język?”.

## Gry — stan i zasady

- Gra reaguje na **wykonanie ćwiczenia**, nie na upływ czasu.
- Każda gra korzysta ze wspólnych części: `useFaceEngine` (kamera), `useSibilantMeter` (mikrofon),
  `playGameSound` (dźwięk), `resultsStore` (wyniki).
- **Kręgle** — nagroda po zdaniu w Speech Rhythm (liczba kręgli z dopasowania rytmu).
- **Balon** — SZ Lip Shape; ustawienia w Trenerze (czas dzióbka, odpoczynek, liczba cykli, poziom).
- **Mechanical Tongue Trainer / gra wieloosobowa online** — wstrzymane decyzją z 11.11.2026.
  Wymaga kont, synchronizacji i serwera (propozycja: Supabase lub Firebase) oraz odpowiedzi na pytania:
  co robi joystick, co oznacza wygraną, jak gracze się znajdują.

## Pytania do logopedki

1. Czy zdania sz / cz / ż i zestaw „sz–s” są w porządku? Co zmienić?
2. Czy akceptuje mieszany (losowy) materiał i samoocenę z nagrania?
3. Które nagrania „soczek / czemu / szalik” uznaje za poprawne, a które za błędne (do progów)?
4. Czy ćwiczenie przyssania języka i trzymanie w tle podczas gry są wskazane?
5. Drożność nosa i wędzidełko — czy były oceniane? Czy dołączyć fizjoterapeutę (napięcie, postawa)?

## Zasady pracy nad kodem

- Progi detekcji ustawiamy z pomiarów na prawdziwej twarzy i głosie, nigdy z teorii.
- Zmiany idą pakietami; po każdym test na urządzeniu i commit.
- Trener, timery, alarmy, raporty i kreator kalibracji zachowują działanie przy każdej zmianie.
- Nowe wyniki zapisujemy przez `resultsStore.js`, nie przez własne klucze localStorage.

## Gdy aplikacja ma trafić do innych użytkowników (sprzedaż)

- **Profile osób:** dziś kalibracje (Mapa ust, mikrofon, profil ust) są jedne na urządzenie. Potrzebne profile wielu ćwiczących.
- **Dane dzieci:** obraz i dźwięk są przetwarzane na urządzeniu i nie są nigdzie wysyłane — to trzeba utrzymać i opisać (RODO, zgoda rodzica).
- **Status prawny:** aplikacja, która deklaruje diagnozę lub leczenie, może podlegać przepisom o wyrobach medycznych. Do sprawdzenia z prawnikiem przed sprzedażą; bezpieczniejsze jest pozycjonowanie jako narzędzie do ćwiczeń zaleconych przez logopedę.
- **Wiarygodność:** wyniki testów trafności z wielu osób (różny wiek, urządzenia, światło) jako podstawa obietnic w opisie produktu.
- **Konta, kopia w chmurze, panel logopedy** — wspólny fundament z planowaną grą wieloosobową.
