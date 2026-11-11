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

PIN strefy dorosłego: `1234` (testowy, `src/components/PinGate.jsx`).

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
