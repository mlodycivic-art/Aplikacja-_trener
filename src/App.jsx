import { useState, useEffect, useRef } from 'react'
import { DEFAULT_USER, DEFAULT_EXERCISES, generateTodayPlan } from './data/defaultData'
import { useStorage } from './hooks/useStorage'
import { useAlarmChecker, useTitleFlash } from './components/useAlarm'
import AlarmBanner from './components/AlarmBanner'
import NavBar        from './components/NavBar'
import ProfileScreen  from './screens/ProfileScreen'
import TodayScreen    from './screens/TodayScreen'
import WeekScreen     from './screens/WeekScreen'
import ModulesScreen  from './screens/ModulesScreen'
import RewardsScreen  from './screens/RewardsScreen'
import TrainerScreen  from './screens/TrainerScreen'
import VisionCalibrationScreen from './screens/VisionCalibrationScreen'
import ParentScreen   from './screens/ParentScreen'
import ExerciseScreen from './screens/ExerciseScreen'

const todayKey = () => new Date().toISOString().slice(0, 10)
const ALARM_TIMEOUT_MS = 5 * 60 * 1000 // 5 minut bez reakcji

export default function App() {
  const [user, setUser]           = useStorage('stc_user', DEFAULT_USER)
  // Szablony ćwiczeń — edytowane w Trenerze, trwałe między dniami
  const [exercises, setExercises] = useStorage('stc_exercises', DEFAULT_EXERCISES)
  // Plan dnia — generowany z szablonów, osobny dla każdego dnia (zachowuje statusy)
  const [plan, setPlan]           = useStorage(`stc_plan_${todayKey()}`, generateTodayPlan(exercises))
  const [screen, setScreen]       = useState('today')
  const [activeEx, setActiveEx]   = useState(null)
  const [alarm, setAlarm]           = useState(null)
  const [gameWindow, setGameWindow]   = useState(null)

  // Alarm checker — sprawdza co kilka sekund czy czas na trening
  useAlarmChecker(plan, (ex) => setAlarm(ex))

  // Migający tytuł karty — widoczny nawet gdy użytkownik jest na innej karcie
  useTitleFlash(!!alarm, '⏰ Czas na trening!')

  const dismissAlarm = () => setAlarm(null)
  const goToToday = () => { setAlarm(null); setScreen('today') }

  // "Start z grą" — otwiera grę w nowej karcie, startuje ćwiczenie z timerem
  const handleStartWithGame = (ex) => {
    const link = ex.params?.gameLink
    let gw = null
    if (link) gw = window.open(link, '_blank')
    setGameWindow(gw)
    setActiveEx(ex)
    setAlarm(null)
    setScreen('exercise')
  }

  // Wyczyść okno gry przy wyjściu z ekranu ćwiczenia i zamknij kartę z grą
  useEffect(() => {
    if (screen !== 'exercise') {
      if (gameWindow && !gameWindow.closed) {
        try { gameWindow.close() } catch (e) {}
      }
      setGameWindow(null)
    }
  }, [screen])

  // Wejście na ekran ćwiczenia automatycznie wycisza alarm
  useEffect(() => {
    if (screen === 'exercise' && alarm) setAlarm(null)
  }, [screen])

  // Globalny wyłącznik mowy przy wyjściu z ekranu ćwiczenia
  useEffect(() => {
    if (screen !== 'exercise') {
      try { window.speechSynthesis?.cancel() } catch (e) {}
    }
  }, [screen])

  // 5 minut bez reakcji → oznacz jako "nie wykonane"
  useEffect(() => {
    if (!alarm) return
    const timer = setTimeout(() => {
      setPlan(prev => prev.map(e =>
        e.id === alarm.id && e.status === 'planned' ? { ...e, status: 'missed' } : e
      ))
      setAlarm(null)
    }, ALARM_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [alarm])

  const renderScreen = () => {
    if (screen === 'exercise') {
      return (
        <ExerciseScreen
          exercise={activeEx}
          plan={plan}
          setPlan={setPlan}
          user={user}
          setUser={setUser}
          setScreen={setScreen}
          gameWindow={gameWindow}
        />
      )
    }
    switch (screen) {
      case 'profile':  return <ProfileScreen user={user} setUser={setUser} setPlan={setPlan} setExercises={setExercises} exercises={exercises} />
      case 'today':    return <TodayScreen   user={user} plan={plan} setPlan={setPlan} setScreen={setScreen} setActiveEx={setActiveEx} />
      case 'week':     return <WeekScreen    exercises={exercises} user={user} plan={plan} />
      case 'modules':  return <ModulesScreen />
      case 'rewards':  return <RewardsScreen user={user} plan={plan} />
      case 'trainer':  return <TrainerScreen exercises={exercises} setExercises={setExercises} plan={plan} setPlan={setPlan} />
      case 'vision':   return <VisionCalibrationScreen exercises={exercises} />
      case 'parent':   return <ParentScreen  user={user} plan={plan} />
      default:         return <TodayScreen   user={user} plan={plan} setPlan={setPlan} setScreen={setScreen} setActiveEx={setActiveEx} />
    }
  }

  return (
    <div className="app">
      <AlarmBanner alarm={alarm} onDismiss={dismissAlarm} onGoToToday={goToToday} onStartWithGame={handleStartWithGame} soundType={alarm?.alarmSound || 'phone'} />

      <header className="app-header">
        <div>
          <h1>🎙 Speech Training Coach</h1>
          <p>Codzienny trening mowy</p>
        </div>
      </header>

      <main className="screen-content">
        {renderScreen()}
      </main>

      {screen !== 'exercise' && (
        <NavBar screen={screen} setScreen={setScreen} />
      )}
    </div>
  )
}
