// Grupy wiekowe i przypisane do nich zestawy progów kalibracji.
//
// WAŻNE: na razie wszystkie grupy mają IDENTYCZNE progi — nie mamy jeszcze
// wystarczających danych testowych, żeby je zróżnicować. W miarę zbierania
// zdjęć/testów z różnych grup wiekowych, każdy z poniższych obiektów można
// dostroić niezależnie, bez wpływu na pozostałe grupy.

export const AGE_GROUPS = [
  { id: 'child', label: 'Dziecko (4–7)' },
  { id: 'older', label: 'Starszak (7–12)' },
  { id: 'teen',  label: 'Młodzież (13–17)' },
  { id: 'adult', label: 'Dorosły (18+)' },
]

function makeDefaultProfile() {
  return {
    // Krok 0 / Krok 1 / Krok 2 — ramka twarzy
    frame: {
      margin: 2,
      minHeightRatio: 0.60,
      minWidthRatio: 0.35,
      maxWidthRatio: 1.15,
      maxTiltDeg: 18,
    },
    // Krok 1 — naturalne, zamknięte usta (bez uśmiechu)
    mouth: {
      aspectMax: 0.12,
      liftMax: 0.045,
      widthMax: 1.15,
    },
    // Krok 2 — poziomy dzióbka
    pucker: {
      level1: { widthMax: 0.48, aspectMin: 0.14, aspectMax: 0.55 },
      level2: { widthMax: 0.44, aspectMin: 0.22, aspectMax: 0.55 },
      level3: { widthMax: 0.40, aspectMin: 0.30, aspectMax: 0.55 },
    },
  }
}

// Dorosły — ściślejsza ramka: dzieci potrzebowały luzu, ale u dorosłych ten
// sam luz pozwalał na zielone przy odsunięciu od monitora albo przekręconej/
// odchylonej głowie, więc tu wracamy do bardziej rygorystycznych wartości.
function makeAdultProfile() {
  const profile = makeDefaultProfile()
  profile.frame = {
    margin: 8,
    minHeightRatio: 0.70,
    minWidthRatio: 0.50,
    maxWidthRatio: 1.02,
    maxTiltDeg: 10,
  }
  return profile
}

export const AGE_PROFILES = {
  child: makeDefaultProfile(),
  older: makeDefaultProfile(),
  teen:  makeDefaultProfile(),
  adult: makeAdultProfile(),
}

export function getAgeProfile(ageGroupId) {
  return AGE_PROFILES[ageGroupId] || AGE_PROFILES.child
}
