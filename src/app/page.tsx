'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { X, Clock } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useSipStore, DrinkType, Consumption } from '@/lib/store/useSipStore'
import { toast } from 'sonner'
import { v4 as uuidv4 } from 'uuid'
import { createClient } from '@/lib/supabase/client'
import { DrinkIcon } from '@/components/DrinkIcon'
import { SortableQuickLogGrid } from '@/components/SortableQuickLogGrid'
import type { NewDrinkInput } from '@/components/AddDrinkModal'
import { useQuickLogOrder } from '@/lib/hooks/useQuickLogOrder'

type DayUnits = { label: string; units: number; isToday: boolean }

export default function Home() {
  const [drinkTypes, setDrinkTypes] = useState<DrinkType[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [weekData, setWeekData] = useState<DayUnits[]>([])

  const addConsumption = useSipStore(state => state.addConsumption)
  const deleteConsumption = useSipStore(state => state.deleteConsumption)
  const setConsumptions = useSipStore(state => state.setConsumptions)
  const consumptions = useSipStore(state => state.consumptions)

  const { orderedDrinks, reorder } = useQuickLogOrder(drinkTypes, userId)

  const supabase = createClient()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setUserId(user.id)

      const { data: types } = await supabase.from('drink_types').select('*').order('created_at')
      if (types) setDrinkTypes(types)

      if (user) {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const { data: logs } = await supabase
          .from('consumptions')
          .select('*, drink_type:drink_types(*)')
          .eq('user_id', user.id)
          .gte('consumed_at', today.toISOString())
          .order('consumed_at', { ascending: false })

        if (logs) setConsumptions(logs)

        // Fetch last 7 days for the mini chart
        const weekAgo = new Date()
        weekAgo.setDate(weekAgo.getDate() - 6)
        weekAgo.setHours(0, 0, 0, 0)
        const { data: weekLogs } = await supabase
          .from('consumptions')
          .select('consumed_at, quantity, drink_type:drink_types(standard_units)')
          .eq('user_id', user.id)
          .gte('consumed_at', weekAgo.toISOString())

        if (weekLogs) {
          const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
          const days: DayUnits[] = []
          for (let i = 6; i >= 0; i--) {
            const d = new Date()
            d.setDate(d.getDate() - i)
            d.setHours(0, 0, 0, 0)
            const nextD = new Date(d)
            nextD.setDate(nextD.getDate() + 1)
            const units = weekLogs
              .filter(l => {
                const t = new Date(l.consumed_at)
                return t >= d && t < nextD
              })
              .reduce((sum, l) => sum + ((l.drink_type as any)?.standard_units || 0) * ((l as any).quantity || 1), 0)
            days.push({ label: dayNames[d.getDay()], units, isToday: i === 0 })
          }
          setWeekData(days)
        }
      }
    }
    init()
  }, [])

  const handleQuickLog = async (drink: DrinkType, quantity: number = 1) => {
    if (!userId) {
      toast.error("You need to be logged in!")
      return
    }
    if (typeof window !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(50)
    }

    const tempId = uuidv4()
    const newLog: Consumption = {
      id: tempId,
      user_id: userId,
      drink_type_id: drink.id,
      quantity,
      consumed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      drink_type: drink
    }

    addConsumption(newLog)
    toast.success(`Logged ${quantity}x ${drink.name}`)

    const { error } = await supabase.from('consumptions').insert({
      user_id: userId,
      drink_type_id: drink.id,
      quantity
    })

    if (error) {
      toast.error("Failed to sync to database")
    }
  }

  const handleCreateDrink = async (input: NewDrinkInput): Promise<boolean> => {
    if (!userId) {
      toast.error("You need to be logged in!")
      return false
    }

    const { data, error } = await supabase
      .from('drink_types')
      .insert({ ...input, created_by: userId })
      .select()
      .single()

    if (error || !data) {
      toast.error("Failed to add drink")
      return false
    }

    setDrinkTypes(prev => [...prev, data])
    toast.success(`Added ${data.name}`)
    return true
  }

  const handleUpdateDrink = async (id: string, input: NewDrinkInput): Promise<boolean> => {
    if (!userId) {
      toast.error("You need to be logged in!")
      return false
    }

    const { data, error } = await supabase
      .from('drink_types')
      .update(input)
      .eq('id', id)
      .select()
      .single()

    if (error || !data) {
      toast.error("Failed to update drink")
      return false
    }

    setDrinkTypes(prev => prev.map(d => (d.id === id ? data : d)))
    setConsumptions(
      consumptions.map(c => (c.drink_type_id === id ? { ...c, drink_type: data } : c))
    )
    toast.success(`Updated ${data.name}`)
    return true
  }

  const handleDeleteDrink = async (id: string): Promise<boolean> => {
    const { error } = await supabase.from('drink_types').delete().eq('id', id)

    if (error) {
      toast.error("Can't delete: this drink has already been logged")
      return false
    }

    setDrinkTypes(prev => prev.filter(d => d.id !== id))
    toast.success("Drink deleted")
    return true
  }

  const handleDelete = async (id: string) => {
    deleteConsumption(id)
    toast.success("Drink deleted")

    const { error } = await supabase.from('consumptions').delete().eq('id', id)
    if (error) {
      toast.error("Failed to delete from database")
    }
  }

  const todayUnits = consumptions.reduce((total, log) => total + (log.drink_type?.standard_units || 0) * (log.quantity || 1), 0)
  const todayDrinks = consumptions.reduce((total, log) => total + (log.quantity || 1), 0)

  return (
    <div className="flex flex-col min-h-full px-5 pt-6 pb-[calc(env(safe-area-inset-bottom)+6rem)] space-y-6 max-w-md mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-50">SipTrack</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Track your drinks</p>
        </div>
      </header>

      {/* Today Summary + Week Chart */}
      <section className="rounded-2xl bg-zinc-900 border border-zinc-800/60 p-5">
        <div className="flex items-stretch gap-5">
          {/* Left: today's count */}
          <div className="flex flex-col justify-center min-w-0">
            <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider mb-2">Today</p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-4xl font-bold tracking-tight text-zinc-50 tabular-nums">{todayUnits.toFixed(1)}</span>
              <span className="text-zinc-500 text-sm">units</span>
            </div>
            {todayDrinks > 0 && (
              <p className="text-zinc-600 text-xs mt-1.5">
                {todayDrinks} drink{todayDrinks !== 1 ? 's' : ''}
              </p>
            )}
          </div>

          {/* Right: mini weekly bar chart */}
          {weekData.length > 0 && (
            <div className="flex-1 flex items-end gap-1.5 min-w-0 pl-4 border-l border-zinc-800/50">
              {weekData.map((day, i) => {
                const maxUnits = Math.max(...weekData.map(d => d.units), 1)
                const heightPct = day.units > 0 ? Math.max((day.units / maxUnits) * 100, 8) : 4
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                    <div className="w-full flex items-end justify-center" style={{ height: 56 }}>
                      <div
                        className={`w-full max-w-[14px] rounded-sm transition-all ${
                          day.isToday
                            ? 'bg-gradient-to-t from-amber-600 to-yellow-300'
                            : day.units > 0
                              ? 'bg-gradient-to-t from-amber-700/40 to-yellow-400/50'
                              : 'bg-zinc-800'
                        }`}
                        style={{ height: `${heightPct}%` }}
                      />
                    </div>
                    <span className={`text-[9px] font-medium ${day.isToday ? 'text-zinc-300' : 'text-zinc-600'}`}>
                      {day.label}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* All Drinks Grid */}
      <SortableQuickLogGrid
        drinks={orderedDrinks}
        onReorder={reorder}
        onQuickLog={handleQuickLog}
        onCreateDrink={handleCreateDrink}
        onUpdateDrink={handleUpdateDrink}
        onDeleteDrink={handleDeleteDrink}
        userId={userId}
      />

      {/* Today's History */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-zinc-600" />
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">History</h2>
        </div>

        {consumptions.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-zinc-600">Nothing logged yet today</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <AnimatePresence>
              {consumptions.map((log) => (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex items-center justify-between py-3 px-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/40"
                >
                  <div className="flex items-center gap-3">
                    <DrinkIcon icon={log.drink_type?.icon || ''} color={log.drink_type?.color} imageUrl={log.drink_type?.image_url} size={20} />
                    <div>
                      <p className="text-sm font-medium text-zinc-200">
                        {log.quantity > 1 && <span className="text-zinc-400">{log.quantity}&times; </span>}
                        {log.drink_type?.name}
                      </p>
                      <p className="text-xs text-zinc-600">
                        {new Date(log.consumed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        <span className="mx-1.5 text-zinc-700">&middot;</span>
                        {((log.drink_type?.standard_units || 0) * (log.quantity || 1)).toFixed(1)} units
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(log.id)}
                    className="p-1.5 text-zinc-700 hover:text-red-400 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>

    </div>
  )
}
