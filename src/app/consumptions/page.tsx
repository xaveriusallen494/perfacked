'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react'
import { useState, useEffect, useMemo } from 'react'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, subMonths,
  eachDayOfInterval, isSameMonth, isSameDay, isToday, format,
} from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { DrinkIcon } from '@/components/DrinkIcon'
import type { Consumption } from '@/lib/store/useSipStore'

type DaySummary = {
  date: Date
  units: number
  count: number
}

function getIntensity(units: number): string {
  if (units === 0) return ''
  if (units <= 2) return 'bg-emerald-500/30'
  if (units <= 5) return 'bg-amber-500/40'
  return 'bg-red-500/40'
}

export default function ConsumptionsPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [consumptions, setConsumptions] = useState<Consumption[]>([])
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  useEffect(() => {
    const fetchMonth = async () => {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const monthStart = startOfMonth(currentMonth)
      const monthEnd = endOfMonth(currentMonth)

      const { data } = await supabase
        .from('consumptions')
        .select('*, drink_type:drink_types(*)')
        .eq('user_id', user.id)
        .gte('consumed_at', monthStart.toISOString())
        .lte('consumed_at', monthEnd.toISOString())
        .order('consumed_at', { ascending: false })

      setConsumptions(data || [])
      setLoading(false)
    }
    fetchMonth()
  }, [currentMonth])

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
    return eachDayOfInterval({ start: calStart, end: calEnd })
  }, [currentMonth])

  const daySummaries = useMemo(() => {
    const map = new Map<string, DaySummary>()
    for (const day of calendarDays) {
      const key = format(day, 'yyyy-MM-dd')
      map.set(key, { date: day, units: 0, count: 0 })
    }
    for (const c of consumptions) {
      const key = format(new Date(c.consumed_at), 'yyyy-MM-dd')
      const entry = map.get(key)
      if (entry) {
        entry.units += c.drink_type?.standard_units || 0
        entry.count += 1
      }
    }
    return map
  }, [calendarDays, consumptions])

  const selectedLogs = useMemo(() => {
    if (!selectedDate) return []
    return consumptions.filter(c => isSameDay(new Date(c.consumed_at), selectedDate))
  }, [selectedDate, consumptions])

  const selectedDayUnits = selectedLogs.reduce(
    (sum, c) => sum + (c.drink_type?.standard_units || 0), 0
  )

  const monthTotal = consumptions.reduce(
    (sum, c) => sum + (c.drink_type?.standard_units || 0), 0
  )

  const daysWithDrinks = new Set(
    consumptions.map(c => format(new Date(c.consumed_at), 'yyyy-MM-dd'))
  ).size

  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  if (loading && consumptions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full px-5 pt-6 pb-[calc(env(safe-area-inset-bottom)+6rem)] space-y-5 max-w-md mx-auto">
      <header>
        <h1 className="text-2xl font-bold text-zinc-50">Consumptions</h1>
        <p className="text-zinc-500 text-sm mt-0.5">Your drinking calendar</p>
      </header>

      {/* Month summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-4">
          <p className="text-xs text-zinc-500 mb-1">Month total</p>
          <p className="text-2xl font-bold text-zinc-50 tabular-nums">{monthTotal.toFixed(1)}</p>
          <p className="text-xs text-zinc-600">units</p>
        </div>
        <div className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-4">
          <p className="text-xs text-zinc-500 mb-1">Days active</p>
          <p className="text-2xl font-bold text-zinc-50 tabular-nums">{daysWithDrinks}</p>
          <p className="text-xs text-zinc-600">of {endOfMonth(currentMonth).getDate()}</p>
        </div>
      </div>

      {/* Calendar */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl bg-zinc-900 border border-zinc-800/60 p-4"
      >
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => { setCurrentMonth(m => subMonths(m, 1)); setSelectedDate(null) }}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="text-sm font-semibold text-zinc-200">
            {format(currentMonth, 'MMMM yyyy')}
          </h2>
          <button
            onClick={() => { setCurrentMonth(m => addMonths(m, 1)); setSelectedDate(null) }}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 mb-1">
          {weekDays.map(d => (
            <div key={d} className="text-center text-[10px] font-medium text-zinc-600 py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map(day => {
            const key = format(day, 'yyyy-MM-dd')
            const summary = daySummaries.get(key)
            const inMonth = isSameMonth(day, currentMonth)
            const today = isToday(day)
            const selected = selectedDate && isSameDay(day, selectedDate)
            const intensity = getIntensity(summary?.units || 0)

            return (
              <button
                key={key}
                onClick={() => inMonth && setSelectedDate(prev =>
                  prev && isSameDay(prev, day) ? null : day
                )}
                disabled={!inMonth}
                className={`
                  relative aspect-square flex flex-col items-center justify-center rounded-lg text-xs transition-all
                  ${!inMonth ? 'text-zinc-800 cursor-default' : 'cursor-pointer'}
                  ${inMonth && !selected ? 'hover:bg-zinc-800/60' : ''}
                  ${selected ? 'ring-1 ring-zinc-400 bg-zinc-800' : ''}
                  ${today && !selected ? 'ring-1 ring-zinc-600' : ''}
                  ${inMonth && intensity && !selected ? intensity : ''}
                `}
              >
                <span className={`
                  font-medium tabular-nums
                  ${selected ? 'text-zinc-50' : today ? 'text-zinc-100' : inMonth ? 'text-zinc-400' : ''}
                `}>
                  {day.getDate()}
                </span>
                {summary && summary.units > 0 && inMonth && (
                  <span className="text-[8px] text-zinc-500 tabular-nums leading-none mt-0.5">
                    {summary.units.toFixed(1)}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </motion.div>

      {/* Selected day detail */}
      <AnimatePresence mode="wait">
        {selectedDate && (
          <motion.div
            key={format(selectedDate, 'yyyy-MM-dd')}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-3"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-zinc-300">
                  {format(selectedDate, 'EEEE, MMMM d')}
                </h3>
                <p className="text-xs text-zinc-600 mt-0.5">
                  {selectedLogs.length} drink{selectedLogs.length !== 1 ? 's' : ''} &middot; {selectedDayUnits.toFixed(1)} units
                </p>
              </div>
              <button
                onClick={() => setSelectedDate(null)}
                className="p-1.5 text-zinc-600 hover:text-zinc-400 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {selectedLogs.length === 0 ? (
              <div className="py-6 text-center rounded-xl bg-zinc-900/60 border border-zinc-800/40">
                <p className="text-sm text-zinc-600">No drinks logged</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {selectedLogs.map(log => (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 py-3 px-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/40"
                  >
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                      style={{ color: log.drink_type?.color, backgroundColor: `${log.drink_type?.color}12` }}
                    >
                      <DrinkIcon icon={log.drink_type?.icon || ''} imageUrl={log.drink_type?.image_url} size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-zinc-200 truncate">{log.drink_type?.name}</p>
                      <p className="text-xs text-zinc-600">
                        {new Date(log.consumed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        <span className="mx-1.5 text-zinc-700">&middot;</span>
                        {log.drink_type?.standard_units} units
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
