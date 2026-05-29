'use client'

import { motion, AnimatePresence } from 'framer-motion'
import {
  Swords, Crown, Trophy, Flag, Loader2, Check, Clock, Beer, History, ChevronRight, X,
} from 'lucide-react'
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { DrinkIcon } from '@/components/DrinkIcon'
import { useQuickLogOrder } from '@/lib/hooks/useQuickLogOrder'
import type { DrinkType } from '@/lib/store/useSipStore'

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

type Profile = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

type Battle = {
  id: string
  name: string
  created_by: string
  status: 'active' | 'ended'
  started_at: string
  ended_at: string | null
  winner_id: string | null
  created_at: string
  winner?: Profile | null
}

type Participant = {
  id: string
  battle_id: string
  user_id: string
  profile: Profile
}

type BattleConsumption = {
  id: string
  user_id: string
  quantity: number
  consumed_at: string
  drink_type: {
    name: string
    standard_units: number
    icon: string
    color: string
    image_url?: string | null
  } | null
}

type Score = {
  user_id: string
  profile: Profile
  units: number
  drinks: number
  color: string
}

const PALETTE = ['#f59e0b', '#3b82f6', '#ec4899', '#10b981', '#a855f7', '#ef4444', '#14b8a6', '#eab308']

const nameOf = (p?: Profile | null) => p?.display_name || p?.username || 'Unknown'

function formatElapsed(startMs: number, nowMs: number) {
  const ms = Math.max(0, nowMs - startMs)
  const mins = Math.floor(ms / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function buildScores(participants: Participant[], consumptions: BattleConsumption[]): Score[] {
  const colorFor = (uid: string) => {
    const idx = participants.findIndex(p => p.user_id === uid)
    return PALETTE[(idx < 0 ? 0 : idx) % PALETTE.length]
  }

  const map = new Map<string, Score>()
  for (const p of participants) {
    map.set(p.user_id, { user_id: p.user_id, profile: p.profile, units: 0, drinks: 0, color: colorFor(p.user_id) })
  }
  for (const c of consumptions) {
    const s = map.get(c.user_id)
    if (!s) continue
    const units = (c.drink_type?.standard_units || 0) * (c.quantity || 1)
    s.units += units
    s.drinks += c.quantity || 1
  }
  return Array.from(map.values()).sort((a, b) => b.units - a.units || b.drinks - a.drinks)
}

type DrinkTally = {
  name: string
  icon: string
  color: string
  image_url?: string | null
  count: number
  units: number
}

// Per-participant tally of which drinks they logged, sorted by count desc.
function buildBreakdown(consumptions: BattleConsumption[]): Map<string, DrinkTally[]> {
  const byUser = new Map<string, Map<string, DrinkTally>>()
  for (const c of consumptions) {
    if (!c.drink_type) continue
    let drinks = byUser.get(c.user_id)
    if (!drinks) {
      drinks = new Map()
      byUser.set(c.user_id, drinks)
    }
    const qty = c.quantity || 1
    const units = (c.drink_type.standard_units || 0) * qty
    const existing = drinks.get(c.drink_type.name)
    if (existing) {
      existing.count += qty
      existing.units += units
    } else {
      drinks.set(c.drink_type.name, {
        name: c.drink_type.name,
        icon: c.drink_type.icon,
        color: c.drink_type.color,
        image_url: c.drink_type.image_url,
        count: qty,
        units,
      })
    }
  }

  const result = new Map<string, DrinkTally[]>()
  for (const [uid, drinks] of byUser) {
    result.set(uid, Array.from(drinks.values()).sort((a, b) => b.count - a.count || b.units - a.units))
  }
  return result
}

function buildChartData(
  participants: Participant[],
  consumptions: BattleConsumption[],
  startTs: number,
  endTs: number,
): Record<string, number>[] {
  const running: Record<string, number> = {}
  for (const p of participants) running[p.user_id] = 0

  const startPoint: Record<string, number> = { t: startTs }
  for (const p of participants) startPoint[p.user_id] = 0
  const points: Record<string, number>[] = [startPoint]

  for (const c of consumptions) {
    const units = (c.drink_type?.standard_units || 0) * (c.quantity || 1)
    running[c.user_id] = (running[c.user_id] || 0) + units
    const point: Record<string, number> = { t: new Date(c.consumed_at).getTime() }
    for (const p of participants) point[p.user_id] = running[p.user_id] || 0
    points.push(point)
  }

  const endPoint: Record<string, number> = { t: endTs }
  for (const p of participants) endPoint[p.user_id] = running[p.user_id] || 0
  points.push(endPoint)

  return points
}

// ----------------------------------------------------------------------------
// Page
// ----------------------------------------------------------------------------

export default function BattlePage() {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [friends, setFriends] = useState<Profile[]>([])
  const [drinkTypes, setDrinkTypes] = useState<DrinkType[]>([])

  // Match the Home quick-log ordering (per-user saved order)
  const { orderedDrinks } = useQuickLogOrder(drinkTypes, userId)

  const [activeBattle, setActiveBattle] = useState<Battle | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [battleConsumptions, setBattleConsumptions] = useState<BattleConsumption[]>([])
  const [pastBattles, setPastBattles] = useState<Battle[]>([])

  // Past battle overview modal
  const [overviewBattle, setOverviewBattle] = useState<Battle | null>(null)
  const [overviewParticipants, setOverviewParticipants] = useState<Participant[]>([])
  const [overviewConsumptions, setOverviewConsumptions] = useState<BattleConsumption[]>([])
  const [overviewLoading, setOverviewLoading] = useState(false)

  // Setup form
  const [battleName, setBattleName] = useState('')
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set())
  const [starting, setStarting] = useState(false)
  const [ending, setEnding] = useState(false)

  // Ticking clock for elapsed time / chart "now" point
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  // --- data loaders -------------------------------------------------------

  const loadBattleData = useCallback(async (battleId: string) => {
    const [{ data: parts }, { data: cons }] = await Promise.all([
      supabase
        .from('battle_participants')
        .select('id, battle_id, user_id, profile:profiles!user_id(id, username, display_name, avatar_url)')
        .eq('battle_id', battleId),
      supabase
        .from('consumptions')
        .select('id, user_id, quantity, consumed_at, drink_type:drink_types!drink_type_id(name, standard_units, icon, color, image_url)')
        .eq('battle_id', battleId)
        .order('consumed_at', { ascending: true }),
    ])

    setParticipants((parts as unknown as Participant[]) ?? [])
    setBattleConsumptions((cons as unknown as BattleConsumption[]) ?? [])
  }, [supabase])

  const loadAll = useCallback(async (uid: string) => {
    // Friends (accepted)
    const { data: friendships } = await supabase
      .from('friendships')
      .select('requester_id, addressee_id, status')
      .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`)
      .eq('status', 'accepted')

    const otherIds = (friendships ?? []).map(f =>
      f.requester_id === uid ? f.addressee_id : f.requester_id
    )

    if (otherIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', otherIds)
      setFriends((profs as Profile[]) ?? [])
    } else {
      setFriends([])
    }

    // Drink catalog for logging
    const { data: types } = await supabase.from('drink_types').select('*').order('created_at')
    if (types) setDrinkTypes(types)

    // My battles
    const { data: myParts } = await supabase
      .from('battle_participants')
      .select('battle_id')
      .eq('user_id', uid)

    const battleIds = (myParts ?? []).map(p => p.battle_id)

    if (battleIds.length > 0) {
      const { data: battles } = await supabase
        .from('battles')
        .select('*, winner:profiles!winner_id(id, username, display_name, avatar_url)')
        .in('id', battleIds)
        .order('created_at', { ascending: false })

      const list = (battles as unknown as Battle[]) ?? []
      const active = list.find(b => b.status === 'active') ?? null
      setActiveBattle(active)
      setPastBattles(list.filter(b => b.status === 'ended'))
      if (active) await loadBattleData(active.id)
    } else {
      setActiveBattle(null)
      setPastBattles([])
    }
  }, [supabase, loadBattleData])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }
      setUserId(user.id)
      setBattleName(`Battle · ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`)
      await loadAll(user.id)
      setLoading(false)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- realtime ------------------------------------------------------------

  useEffect(() => {
    if (!activeBattle) return
    const battleId = activeBattle.id

    const channel = supabase
      .channel(`battle:${battleId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'consumptions', filter: `battle_id=eq.${battleId}` },
        () => { loadBattleData(battleId) }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'battle_participants', filter: `battle_id=eq.${battleId}` },
        () => { loadBattleData(battleId) }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'battles', filter: `id=eq.${battleId}` },
        (payload) => {
          const updated = payload.new as Battle
          if (updated.status === 'ended' && userId) {
            toast.info('The battle has ended')
            loadAll(userId)
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [activeBattle, supabase, loadBattleData, loadAll, userId])

  // --- derived scores ------------------------------------------------------

  const scores: Score[] = useMemo(
    () => buildScores(participants, battleConsumptions),
    [participants, battleConsumptions],
  )

  // Cumulative units over time, one series per participant. Extends to "now" so it keeps moving live.
  const chartData = useMemo(() => {
    if (!activeBattle) return []
    return buildChartData(participants, battleConsumptions, new Date(activeBattle.started_at).getTime(), now)
  }, [activeBattle, participants, battleConsumptions, now])

  // --- actions -------------------------------------------------------------

  const toggleFriend = (id: string) => {
    setSelectedFriends(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const startBattle = async () => {
    if (!userId) return
    const name = battleName.trim() || 'Battle'
    setStarting(true)

    const { data: battle, error } = await supabase
      .from('battles')
      .insert({ name, created_by: userId })
      .select()
      .single()

    if (error || !battle) {
      toast.error('Failed to start battle')
      setStarting(false)
      return
    }

    const rows = [userId, ...Array.from(selectedFriends)].map(uid => ({
      battle_id: battle.id,
      user_id: uid,
    }))

    const { error: pErr } = await supabase.from('battle_participants').insert(rows)
    if (pErr) {
      toast.error('Failed to add participants')
      await supabase.from('battles').delete().eq('id', battle.id)
      setStarting(false)
      return
    }

    if (typeof window !== 'undefined' && navigator.vibrate) navigator.vibrate(50)
    toast.success('Battle on! 🍻')
    setSelectedFriends(new Set())
    setActiveBattle(battle as unknown as Battle)
    await loadBattleData(battle.id)
    setStarting(false)
  }

  const logDrink = async (drink: DrinkType) => {
    if (!userId || !activeBattle) return
    if (typeof window !== 'undefined' && navigator.vibrate) navigator.vibrate(40)

    // optimistic
    const optimistic: BattleConsumption = {
      id: `temp-${Date.now()}`,
      user_id: userId,
      quantity: 1,
      consumed_at: new Date().toISOString(),
      drink_type: {
        name: drink.name,
        standard_units: drink.standard_units,
        icon: drink.icon,
        color: drink.color,
        image_url: drink.image_url,
      },
    }
    setBattleConsumptions(prev => [...prev, optimistic])

    const { error } = await supabase.from('consumptions').insert({
      user_id: userId,
      drink_type_id: drink.id,
      quantity: 1,
      battle_id: activeBattle.id,
    })

    if (error) {
      setBattleConsumptions(prev => prev.filter(c => c.id !== optimistic.id))
      toast.error('Failed to log drink')
    } else {
      toast.success(`+1 ${drink.name}`)
    }
  }

  const endBattle = async () => {
    if (!userId || !activeBattle) return
    setEnding(true)

    const winner = scores.find(s => s.drinks > 0) ?? null // scores already sorted desc

    const { error } = await supabase
      .from('battles')
      .update({
        status: 'ended',
        ended_at: new Date().toISOString(),
        winner_id: winner ? winner.user_id : null,
      })
      .eq('id', activeBattle.id)

    if (error) {
      toast.error('Failed to end battle')
      setEnding(false)
      return
    }

    if (typeof window !== 'undefined' && navigator.vibrate) navigator.vibrate([60, 40, 60])
    toast.success(winner ? `${nameOf(winner.profile)} wins! 🏆` : 'Battle ended')
    await loadAll(userId)
    setEnding(false)
  }

  const openBattleOverview = useCallback(async (battle: Battle) => {
    setOverviewBattle(battle)
    setOverviewLoading(true)
    const [{ data: parts }, { data: cons }] = await Promise.all([
      supabase
        .from('battle_participants')
        .select('id, battle_id, user_id, profile:profiles!user_id(id, username, display_name, avatar_url)')
        .eq('battle_id', battle.id),
      supabase
        .from('consumptions')
        .select('id, user_id, quantity, consumed_at, drink_type:drink_types!drink_type_id(name, standard_units, icon, color, image_url)')
        .eq('battle_id', battle.id)
        .order('consumed_at', { ascending: true }),
    ])
    setOverviewParticipants((parts as unknown as Participant[]) ?? [])
    setOverviewConsumptions((cons as unknown as BattleConsumption[]) ?? [])
    setOverviewLoading(false)
  }, [supabase])

  // ------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
      </div>
    )
  }

  const isCreator = activeBattle?.created_by === userId

  return (
    <>
    <div className="flex flex-col min-h-full px-5 pt-6 pb-[calc(env(safe-area-inset-bottom)+6rem)] space-y-6 max-w-md mx-auto">
      <header className="flex items-center gap-2.5">
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500/20 to-yellow-300/10 border border-amber-500/20">
          <Swords className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-50">Battle</h1>
          <p className="text-zinc-500 text-sm mt-0.5">
            {activeBattle ? 'May the best drinker win' : 'Challenge your friends'}
          </p>
        </div>
      </header>

      {activeBattle ? (
        <BattleArena
          battle={activeBattle}
          scores={scores}
          chartData={chartData}
          participants={participants}
          consumptions={battleConsumptions}
          drinkTypes={orderedDrinks}
          userId={userId}
          isCreator={!!isCreator}
          ending={ending}
          now={now}
          onLog={logDrink}
          onEnd={endBattle}
        />
      ) : (
        <BattleSetup
          battleName={battleName}
          setBattleName={setBattleName}
          friends={friends}
          selectedFriends={selectedFriends}
          toggleFriend={toggleFriend}
          starting={starting}
          onStart={startBattle}
          pastBattles={pastBattles}
          onSelectBattle={openBattleOverview}
        />
      )}
    </div>

    <AnimatePresence>
      {overviewBattle && (
        <BattleOverview
          battle={overviewBattle}
          participants={overviewParticipants}
          consumptions={overviewConsumptions}
          loading={overviewLoading}
          userId={userId}
          onClose={() => setOverviewBattle(null)}
        />
      )}
    </AnimatePresence>
    </>
  )
}

// ----------------------------------------------------------------------------
// Setup view
// ----------------------------------------------------------------------------

function BattleSetup({
  battleName, setBattleName, friends, selectedFriends, toggleFriend, starting, onStart, pastBattles, onSelectBattle,
}: {
  battleName: string
  setBattleName: (v: string) => void
  friends: Profile[]
  selectedFriends: Set<string>
  toggleFriend: (id: string) => void
  starting: boolean
  onStart: () => void
  pastBattles: Battle[]
  onSelectBattle: (battle: Battle) => void
}) {
  return (
    <div className="space-y-6">
      {/* Name */}
      <section className="space-y-2">
        <label className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Battle name</label>
        <Input
          value={battleName}
          onChange={(e) => setBattleName(e.target.value)}
          placeholder="Friday Night Showdown"
          className="h-11 bg-zinc-900 border-zinc-800/60 text-zinc-100 placeholder:text-zinc-600 rounded-xl focus:border-zinc-600"
        />
      </section>

      {/* Opponents */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Opponents</h2>
          <span className="text-xs text-zinc-600 tabular-nums">{selectedFriends.size} selected</span>
        </div>

        {friends.length === 0 ? (
          <div className="py-8 text-center rounded-xl bg-zinc-900/60 border border-zinc-800/40">
            <p className="text-sm text-zinc-500">No friends yet</p>
            <p className="text-xs text-zinc-600 mt-1">Add friends to battle them</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {friends.map((f) => {
              const selected = selectedFriends.has(f.id)
              return (
                <button
                  key={f.id}
                  onClick={() => toggleFriend(f.id)}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-colors text-left ${
                    selected
                      ? 'bg-amber-500/10 border-amber-500/40'
                      : 'bg-zinc-900 border-zinc-800/60 hover:border-zinc-700'
                  }`}
                >
                  <Avatar className="w-9 h-9 border border-zinc-800">
                    <AvatarImage src={f.avatar_url || undefined} />
                    <AvatarFallback className="bg-zinc-800 text-zinc-400 text-xs">
                      {nameOf(f).charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex-1 text-sm font-medium text-zinc-200">{nameOf(f)}</span>
                  <span className={`flex items-center justify-center w-6 h-6 rounded-full border ${
                    selected ? 'bg-amber-500 border-amber-500 text-zinc-950' : 'border-zinc-700 text-transparent'
                  }`}>
                    <Check className="w-4 h-4" strokeWidth={3} />
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </section>

      <button
        onClick={onStart}
        disabled={starting}
        className="w-full h-12 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 font-semibold flex items-center justify-center gap-2 disabled:opacity-60 transition-opacity"
      >
        {starting ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <>
            <Swords className="w-5 h-5" />
            Start Battle
          </>
        )}
      </button>
      <p className="text-center text-xs text-zinc-600 -mt-3">
        You can battle solo or with selected friends. Drinks logged here also count toward your normal totals.
      </p>

      {/* Past battles */}
      {pastBattles.length > 0 && (
        <section className="space-y-3 pt-2">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-zinc-600" />
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Past Battles</h2>
          </div>
          <div className="flex flex-col gap-2">
            {pastBattles.map((b) => (
              <button
                key={b.id}
                onClick={() => onSelectBattle(b)}
                className="flex items-center gap-3 p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/40 text-left hover:bg-zinc-900 hover:border-zinc-700/60 transition-colors"
              >
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-zinc-800/60">
                  <Trophy className="w-4 h-4 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-200 truncate">{b.name}</p>
                  <p className="text-xs text-zinc-600">
                    {b.winner ? `Won by ${nameOf(b.winner)}` : 'No winner'}
                    {b.ended_at && (
                      <>
                        <span className="mx-1.5 text-zinc-700">·</span>
                        {new Date(b.ended_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </>
                    )}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ----------------------------------------------------------------------------
// Live arena view
// ----------------------------------------------------------------------------

function BattleArena({
  battle, scores, chartData, participants, consumptions, drinkTypes, userId, isCreator, ending, now, onLog, onEnd,
}: {
  battle: Battle
  scores: Score[]
  chartData: Record<string, number>[]
  participants: Participant[]
  consumptions: BattleConsumption[]
  drinkTypes: DrinkType[]
  userId: string | null
  isCreator: boolean
  ending: boolean
  now: number
  onLog: (drink: DrinkType) => void
  onEnd: () => void
}) {
  const totalDrinks = scores.reduce((s, x) => s + x.drinks, 0)
  const totalUnits = scores.reduce((s, x) => s + x.units, 0)
  const leaderUnits = Math.max(...scores.map(s => s.units), 0)
  const startMs = new Date(battle.started_at).getTime()
  const breakdown = useMemo(() => buildBreakdown(consumptions), [consumptions])

  return (
    <div className="space-y-6">
      {/* Battle banner */}
      <section className="rounded-2xl bg-gradient-to-br from-amber-500/10 to-zinc-900 border border-amber-500/20 p-5">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-amber-400/80">Live battle</p>
            <h2 className="text-lg font-bold text-zinc-50 truncate mt-0.5">{battle.name}</h2>
          </div>
          <div className="flex items-center gap-1.5 text-zinc-400 shrink-0 ml-3">
            <Clock className="w-3.5 h-3.5" />
            <span className="text-sm tabular-nums">{formatElapsed(startMs, now)}</span>
          </div>
        </div>
        <div className="flex gap-6 mt-4">
          <div>
            <p className="text-2xl font-bold text-zinc-50 tabular-nums">{totalUnits.toFixed(1)}</p>
            <p className="text-xs text-zinc-500">total units</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-zinc-50 tabular-nums">{totalDrinks}</p>
            <p className="text-xs text-zinc-500">total drinks</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-zinc-50 tabular-nums">{participants.length}</p>
            <p className="text-xs text-zinc-500">players</p>
          </div>
        </div>
      </section>

      {/* Leaderboard */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Leaderboard</h2>
        <div className="flex flex-col gap-2">
          {scores.map((s, i) => {
            const isLeader = i === 0 && s.units > 0
            const isYou = s.user_id === userId
            const pct = leaderUnits > 0 ? Math.max((s.units / leaderUnits) * 100, s.units > 0 ? 6 : 0) : 0
            return (
              <motion.div
                key={s.user_id}
                layout
                className="relative overflow-hidden rounded-xl bg-zinc-900 border border-zinc-800/60 p-3"
              >
                {/* progress fill */}
                <div
                  className="absolute inset-y-0 left-0 opacity-10"
                  style={{ width: `${pct}%`, backgroundColor: s.color }}
                />
                <div className="relative flex items-center gap-3">
                  <span className="w-5 text-center text-sm font-bold tabular-nums text-zinc-500">{i + 1}</span>
                  <div className="relative">
                    <Avatar className="w-9 h-9 border-2" style={{ borderColor: s.color }}>
                      <AvatarImage src={s.profile?.avatar_url || undefined} />
                      <AvatarFallback className="bg-zinc-800 text-zinc-400 text-xs">
                        {nameOf(s.profile).charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {isLeader && (
                      <Crown className="absolute -top-2 -right-1.5 w-4 h-4 text-amber-400 fill-amber-400 rotate-12" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-200 truncate">
                      {nameOf(s.profile)}
                      {isYou && <span className="text-xs text-zinc-600 ml-1.5">you</span>}
                    </p>
                    <p className="text-xs text-zinc-600">{s.drinks} drink{s.drinks !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-bold text-zinc-50 tabular-nums">{s.units.toFixed(1)}</p>
                    <p className="text-[10px] text-zinc-600 -mt-0.5">units</p>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      </section>

      {/* Cumulative chart */}
      {totalDrinks > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Race to the finish</h2>
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800/60 p-4 pr-3">
            <div style={{ width: '100%', height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis
                    dataKey="t"
                    type="number"
                    scale="time"
                    domain={['dataMin', 'dataMax']}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#52525b', fontSize: 11 }}
                    tickFormatter={(v) => new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    minTickGap={40}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#52525b', fontSize: 11 }}
                    width={36}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: '#a1a1aa' }}
                    labelFormatter={(v) => new Date(v as number).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    formatter={(value, key) => {
                      const p = participants.find(pp => pp.user_id === key)
                      return [`${Number(value).toFixed(1)} units`, nameOf(p?.profile)]
                    }}
                  />
                  {participants.map((p, idx) => (
                    <Line
                      key={p.user_id}
                      type="stepAfter"
                      dataKey={p.user_id}
                      stroke={PALETTE[idx % PALETTE.length]}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            {/* legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 px-1">
              {scores.map((s) => (
                <div key={s.user_id} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-xs text-zinc-500">{nameOf(s.profile)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Quick log */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Beer className="w-4 h-4 text-zinc-600" />
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Log a drink</h2>
        </div>
        {drinkTypes.length === 0 ? (
          <p className="text-sm text-zinc-600">No drinks available</p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {drinkTypes.map((d) => (
              <button
                key={d.id}
                onClick={() => onLog(d)}
                className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl bg-zinc-900 border border-zinc-800/60 active:scale-95 active:border-amber-500/50 transition-all"
              >
                <DrinkIcon icon={d.icon} color={d.color} imageUrl={d.image_url} size={22} />
                <span className="text-[10px] text-zinc-400 text-center leading-tight line-clamp-2 w-full">{d.name}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Per-participant breakdown */}
      <ParticipantBreakdown scores={scores} breakdown={breakdown} userId={userId} />

      {/* End battle */}
      {isCreator ? (
        <button
          onClick={onEnd}
          disabled={ending}
          className="w-full h-12 rounded-2xl bg-zinc-100 text-zinc-900 font-semibold flex items-center justify-center gap-2 disabled:opacity-60 transition-opacity"
        >
          {ending ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Flag className="w-5 h-5" /> End Battle</>}
        </button>
      ) : (
        <p className="text-center text-xs text-zinc-600">Only the host can end the battle.</p>
      )}
    </div>
  )
}

// ----------------------------------------------------------------------------
// Per-participant drink breakdown
// ----------------------------------------------------------------------------

function ParticipantBreakdown({
  scores, breakdown, userId,
}: {
  scores: Score[]
  breakdown: Map<string, DrinkTally[]>
  userId: string | null
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Who drank what</h2>
      <div className="flex flex-col gap-2">
        {scores.map((s) => {
          const drinks = breakdown.get(s.user_id) ?? []
          const isYou = s.user_id === userId
          return (
            <div key={s.user_id} className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-3 space-y-2.5">
              <div className="flex items-center gap-3">
                <Avatar className="w-8 h-8 border-2" style={{ borderColor: s.color }}>
                  <AvatarImage src={s.profile?.avatar_url || undefined} />
                  <AvatarFallback className="bg-zinc-800 text-zinc-400 text-xs">
                    {nameOf(s.profile).charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-200 truncate">
                    {nameOf(s.profile)}
                    {isYou && <span className="text-xs text-zinc-600 ml-1.5">you</span>}
                  </p>
                  <p className="text-xs text-zinc-600">
                    {s.drinks} drink{s.drinks !== 1 ? 's' : ''}
                    <span className="mx-1.5 text-zinc-700">·</span>
                    {s.units.toFixed(1)} units
                  </p>
                </div>
              </div>
              {drinks.length === 0 ? (
                <p className="text-xs text-zinc-600 pl-11">Nothing logged yet</p>
              ) : (
                <div className="flex flex-wrap gap-1.5 pl-11">
                  {drinks.map((d) => (
                    <span
                      key={d.name}
                      className="flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-lg bg-zinc-800/60 border border-zinc-800"
                    >
                      <DrinkIcon icon={d.icon} color={d.color} imageUrl={d.image_url} size={14} />
                      <span className="text-xs text-zinc-300">{d.name}</span>
                      <span className="text-xs font-semibold text-zinc-500 tabular-nums">×{d.count}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ----------------------------------------------------------------------------
// Past battle overview modal
// ----------------------------------------------------------------------------

function BattleOverview({
  battle, participants, consumptions, loading, userId, onClose,
}: {
  battle: Battle
  participants: Participant[]
  consumptions: BattleConsumption[]
  loading: boolean
  userId: string | null
  onClose: () => void
}) {
  const scores = useMemo(() => buildScores(participants, consumptions), [participants, consumptions])
  const breakdown = useMemo(() => buildBreakdown(consumptions), [consumptions])

  const startTs = new Date(battle.started_at).getTime()
  const endTs = battle.ended_at ? new Date(battle.ended_at).getTime() : new Date(battle.created_at).getTime()

  const chartData = useMemo(
    () => buildChartData(participants, consumptions, startTs, endTs),
    [participants, consumptions, startTs, endTs],
  )

  const totalDrinks = scores.reduce((s, x) => s + x.drinks, 0)
  const totalUnits = scores.reduce((s, x) => s + x.units, 0)
  const leaderUnits = Math.max(...scores.map(s => s.units), 0)
  const winner = battle.winner ?? scores.find(s => s.drinks > 0)?.profile ?? null

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-end justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        className="relative w-full max-w-md bg-zinc-900 border-t border-zinc-800 rounded-t-3xl p-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] space-y-5 max-h-[90vh] overflow-y-auto"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-amber-400/80">Battle recap</p>
            <h2 className="text-lg font-bold text-zinc-50 truncate mt-0.5">{battle.name}</h2>
            <p className="text-xs text-zinc-600 mt-0.5">
              {new Date(battle.started_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              <span className="mx-1.5 text-zinc-700">·</span>
              {formatElapsed(startTs, endTs)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-500 hover:text-zinc-300 rounded-lg transition-colors shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
          </div>
        ) : (
          <>
            {/* Winner */}
            {winner && (
              <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-amber-500/15 to-zinc-900 border border-amber-500/20 p-4">
                <div className="relative">
                  <Avatar className="w-11 h-11 border-2 border-amber-500/60">
                    <AvatarImage src={winner.avatar_url || undefined} />
                    <AvatarFallback className="bg-zinc-800 text-zinc-300">
                      {nameOf(winner).charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <Crown className="absolute -top-2 -right-1.5 w-4 h-4 text-amber-400 fill-amber-400 rotate-12" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-amber-400/80 uppercase tracking-wider font-medium">Winner</p>
                  <p className="text-base font-bold text-zinc-50 truncate">{nameOf(winner)}</p>
                </div>
              </div>
            )}

            {/* Stats */}
            <div className="flex gap-6">
              <div>
                <p className="text-2xl font-bold text-zinc-50 tabular-nums">{totalUnits.toFixed(1)}</p>
                <p className="text-xs text-zinc-500">total units</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-50 tabular-nums">{totalDrinks}</p>
                <p className="text-xs text-zinc-500">total drinks</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-50 tabular-nums">{participants.length}</p>
                <p className="text-xs text-zinc-500">players</p>
              </div>
            </div>

            {/* Final leaderboard */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Final standings</h3>
              <div className="flex flex-col gap-2">
                {scores.map((s, i) => {
                  const isLeader = i === 0 && s.units > 0
                  const isYou = s.user_id === userId
                  const pct = leaderUnits > 0 ? Math.max((s.units / leaderUnits) * 100, s.units > 0 ? 6 : 0) : 0
                  return (
                    <div key={s.user_id} className="relative overflow-hidden rounded-xl bg-zinc-950/60 border border-zinc-800/60 p-3">
                      <div className="absolute inset-y-0 left-0 opacity-10" style={{ width: `${pct}%`, backgroundColor: s.color }} />
                      <div className="relative flex items-center gap-3">
                        <span className="w-5 text-center text-sm font-bold tabular-nums text-zinc-500">{i + 1}</span>
                        <div className="relative">
                          <Avatar className="w-9 h-9 border-2" style={{ borderColor: s.color }}>
                            <AvatarImage src={s.profile?.avatar_url || undefined} />
                            <AvatarFallback className="bg-zinc-800 text-zinc-400 text-xs">
                              {nameOf(s.profile).charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          {isLeader && (
                            <Crown className="absolute -top-2 -right-1.5 w-4 h-4 text-amber-400 fill-amber-400 rotate-12" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-zinc-200 truncate">
                            {nameOf(s.profile)}
                            {isYou && <span className="text-xs text-zinc-600 ml-1.5">you</span>}
                          </p>
                          <p className="text-xs text-zinc-600">{s.drinks} drink{s.drinks !== 1 ? 's' : ''}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-base font-bold text-zinc-50 tabular-nums">{s.units.toFixed(1)}</p>
                          <p className="text-[10px] text-zinc-600 -mt-0.5">units</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            {/* Per-participant breakdown */}
            <ParticipantBreakdown scores={scores} breakdown={breakdown} userId={userId} />

            {/* Cumulative chart */}
            {totalDrinks > 0 && (
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Race to the finish</h3>
                <div className="rounded-2xl bg-zinc-950/60 border border-zinc-800/60 p-4 pr-3">
                  <div style={{ width: '100%', height: 180 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                        <XAxis
                          dataKey="t"
                          type="number"
                          scale="time"
                          domain={['dataMin', 'dataMax']}
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: '#52525b', fontSize: 11 }}
                          tickFormatter={(v) => new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          minTickGap={40}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: '#52525b', fontSize: 11 }}
                          width={36}
                          allowDecimals={false}
                        />
                        <Tooltip
                          contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }}
                          labelStyle={{ color: '#a1a1aa' }}
                          labelFormatter={(v) => new Date(v as number).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          formatter={(value, key) => {
                            const p = participants.find(pp => pp.user_id === key)
                            return [`${Number(value).toFixed(1)} units`, nameOf(p?.profile)]
                          }}
                        />
                        {participants.map((p, idx) => (
                          <Line
                            key={p.user_id}
                            type="stepAfter"
                            dataKey={p.user_id}
                            stroke={PALETTE[idx % PALETTE.length]}
                            strokeWidth={2}
                            dot={false}
                            isAnimationActive={false}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 px-1">
                    {scores.map((s) => (
                      <div key={s.user_id} className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                        <span className="text-xs text-zinc-500">{nameOf(s.profile)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </motion.div>
    </motion.div>
  )
}
