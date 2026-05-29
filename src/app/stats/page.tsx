'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { motion } from 'framer-motion'
import { Flame, Trophy, Loader2, TrendingDown, TrendingUp, Calendar } from 'lucide-react'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type DayData = { day: string; units: number; date: string }

type MonthlyData = { month: string; units: number }

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 py-2 px-3 rounded-lg shadow-xl">
        <p className="text-zinc-400 text-xs">{label}</p>
        <p className="text-zinc-100 font-semibold text-sm">
          {payload[0].value.toFixed(1)} <span className="text-zinc-500 font-normal">units</span>
        </p>
      </div>
    )
  }
  return null
}

function computeDryStreak(consumptions: { consumed_at: string }[]): number {
  if (consumptions.length === 0) return 0

  const daysWithDrinks = new Set(
    consumptions.map(c => {
      const d = new Date(c.consumed_at)
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    })
  )

  let streak = 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`
  if (daysWithDrinks.has(todayKey)) return 0

  for (let i = 1; i <= 365; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    if (daysWithDrinks.has(key)) break
    streak++
  }
  return streak
}

function getRank(weekTotal: number, dryStreak: number): string {
  if (dryStreak >= 14) return 'Sober Legend'
  if (dryStreak >= 7) return 'Clean Streak'
  if (weekTotal === 0) return 'Dry Week'
  if (weekTotal <= 5) return 'Casual Sipper'
  if (weekTotal <= 14) return 'Social Drinker'
  if (weekTotal <= 21) return 'Weekend Warrior'
  return 'Party Mode'
}

export default function StatsPage() {
  const [weekData, setWeekData] = useState<DayData[]>([])
  const [monthData, setMonthData] = useState<MonthlyData[]>([])
  const [dryStreak, setDryStreak] = useState(0)
  const [loading, setLoading] = useState(true)
  const [prevWeekTotal, setPrevWeekTotal] = useState(0)

  const supabase = createClient()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

      // Current week (last 7 days)
      const weekAgo = new Date()
      weekAgo.setDate(weekAgo.getDate() - 6)
      weekAgo.setHours(0, 0, 0, 0)

      const { data: weekLogs } = await supabase
        .from('consumptions')
        .select('consumed_at, drink_type:drink_types(standard_units)')
        .eq('user_id', user.id)
        .gte('consumed_at', weekAgo.toISOString())

      const days: DayData[] = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        d.setHours(0, 0, 0, 0)
        const nextD = new Date(d)
        nextD.setDate(nextD.getDate() + 1)

        const units = (weekLogs || [])
          .filter(l => {
            const t = new Date(l.consumed_at)
            return t >= d && t < nextD
          })
          .reduce((sum, l) => sum + ((l.drink_type as any)?.standard_units || 0), 0)

        days.push({
          day: dayNames[d.getDay()],
          units: Math.round(units * 10) / 10,
          date: d.toISOString(),
        })
      }
      setWeekData(days)

      // Previous week for trend comparison
      const twoWeeksAgo = new Date()
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 13)
      twoWeeksAgo.setHours(0, 0, 0, 0)

      const { data: prevWeekLogs } = await supabase
        .from('consumptions')
        .select('consumed_at, drink_type:drink_types(standard_units)')
        .eq('user_id', user.id)
        .gte('consumed_at', twoWeeksAgo.toISOString())
        .lt('consumed_at', weekAgo.toISOString())

      const prevTotal = (prevWeekLogs || [])
        .reduce((sum, l) => sum + ((l.drink_type as any)?.standard_units || 0), 0)
      setPrevWeekTotal(Math.round(prevTotal * 10) / 10)

      // Monthly data (last 6 months)
      const sixMonthsAgo = new Date()
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5)
      sixMonthsAgo.setDate(1)
      sixMonthsAgo.setHours(0, 0, 0, 0)

      const { data: monthLogs } = await supabase
        .from('consumptions')
        .select('consumed_at, drink_type:drink_types(standard_units)')
        .eq('user_id', user.id)
        .gte('consumed_at', sixMonthsAgo.toISOString())

      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      const months: MonthlyData[] = []
      for (let i = 5; i >= 0; i--) {
        const m = new Date()
        m.setMonth(m.getMonth() - i)
        m.setDate(1)
        m.setHours(0, 0, 0, 0)
        const nextM = new Date(m)
        nextM.setMonth(nextM.getMonth() + 1)

        const units = (monthLogs || [])
          .filter(l => {
            const t = new Date(l.consumed_at)
            return t >= m && t < nextM
          })
          .reduce((sum, l) => sum + ((l.drink_type as any)?.standard_units || 0), 0)

        months.push({
          month: monthNames[m.getMonth()],
          units: Math.round(units * 10) / 10,
        })
      }
      setMonthData(months)

      // Dry streak — fetch last 90 days of consumptions
      const ninetyDaysAgo = new Date()
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
      const { data: streakLogs } = await supabase
        .from('consumptions')
        .select('consumed_at')
        .eq('user_id', user.id)
        .gte('consumed_at', ninetyDaysAgo.toISOString())

      setDryStreak(computeDryStreak(streakLogs || []))

      setLoading(false)
    }
    init()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
      </div>
    )
  }

  const weekTotal = weekData.reduce((sum, d) => sum + d.units, 0)
  const dailyAvg = weekData.length > 0 ? (weekTotal / 7).toFixed(1) : '0'
  const peakDay = weekData.length > 0 ? Math.max(...weekData.map(d => d.units)) : 0
  const rank = getRank(weekTotal, dryStreak)
  const weekDiff = weekTotal - prevWeekTotal

  return (
    <div className="flex flex-col h-full px-5 pt-6 pb-24 space-y-6 max-w-md mx-auto">
      <header>
        <h1 className="text-2xl font-bold text-zinc-50">Statistics</h1>
        <p className="text-zinc-500 text-sm mt-0.5">Your drinking insights</p>
      </header>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-4">
          <p className="text-xs text-zinc-500 mb-1">This week</p>
          <p className="text-2xl font-bold text-zinc-50 tabular-nums">{weekTotal.toFixed(1)}</p>
          <p className="text-xs text-zinc-600">units</p>
        </div>
        <div className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-4">
          <p className="text-xs text-zinc-500 mb-1">Daily avg</p>
          <p className="text-2xl font-bold text-zinc-50 tabular-nums">{dailyAvg}</p>
          <p className="text-xs text-zinc-600">units</p>
        </div>
        <div className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-4">
          <p className="text-xs text-zinc-500 mb-1">Peak</p>
          <p className="text-2xl font-bold text-zinc-50 tabular-nums">{peakDay.toFixed(1)}</p>
          <p className="text-xs text-zinc-600">units</p>
        </div>
      </div>

      {/* Streaks + Rank */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-3 rounded-xl bg-zinc-900 border border-zinc-800/60 p-4">
          <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
            <Flame className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <p className="text-xs text-zinc-500">Dry streak</p>
            <p className="text-lg font-bold text-zinc-50">
              {dryStreak} <span className="text-sm font-normal text-zinc-500">{dryStreak === 1 ? 'day' : 'days'}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-zinc-900 border border-zinc-800/60 p-4">
          <div className="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
            <Trophy className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <p className="text-xs text-zinc-500">Rank</p>
            <p className="text-sm font-bold text-zinc-50">{rank}</p>
          </div>
        </div>
      </div>

      {/* Week trend */}
      {prevWeekTotal > 0 && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border ${
          weekDiff <= 0
            ? 'bg-emerald-500/5 border-emerald-500/20'
            : 'bg-red-500/5 border-red-500/20'
        }`}>
          {weekDiff <= 0
            ? <TrendingDown className="w-4 h-4 text-emerald-400" />
            : <TrendingUp className="w-4 h-4 text-red-400" />
          }
          <p className={`text-sm ${weekDiff <= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {weekDiff <= 0 ? '' : '+'}{weekDiff.toFixed(1)} units vs last week
          </p>
        </div>
      )}

      {/* Weekly chart */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-5"
      >
        <div className="flex items-center gap-2 mb-5">
          <Calendar className="w-4 h-4 text-zinc-500" />
          <h3 className="text-sm font-semibold text-zinc-300">Units per day</h3>
        </div>
        <div className="h-52 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekData} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
              <XAxis
                dataKey="day"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#52525b', fontSize: 12 }}
                dy={8}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#52525b', fontSize: 12 }}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#18181b', radius: 6 }} />
              <Bar dataKey="units" radius={[4, 4, 4, 4]} maxBarSize={36}>
                {weekData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.units === 0 ? '#27272a' : entry.units >= 5 ? '#f87171' : '#a1a1aa'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Monthly chart */}
      {monthData.some(m => m.units > 0) && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-5"
        >
          <div className="flex items-center gap-2 mb-5">
            <Calendar className="w-4 h-4 text-zinc-500" />
            <h3 className="text-sm font-semibold text-zinc-300">Monthly trend</h3>
          </div>
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthData} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#52525b', fontSize: 12 }}
                  dy={8}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#52525b', fontSize: 12 }}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#18181b', radius: 6 }} />
                <Bar dataKey="units" radius={[4, 4, 4, 4]} maxBarSize={36} fill="#a1a1aa" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      )}
    </div>
  )
}
