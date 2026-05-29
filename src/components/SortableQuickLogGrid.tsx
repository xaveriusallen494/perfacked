'use client'

import { useState, useCallback, useMemo, useRef } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { motion, AnimatePresence } from 'framer-motion'
import { GripVertical, Search, X, Minus, Plus, ChevronDown, Pencil } from 'lucide-react'
import { DrinkIcon } from '@/components/DrinkIcon'
import { AddDrinkModal, type NewDrinkInput } from '@/components/AddDrinkModal'
import type { DrinkType } from '@/lib/store/useSipStore'

const LONG_PRESS_MS = 400

type SortableItemProps = {
  drink: DrinkType
  isEditing: boolean
  editable?: boolean
  onQuickLog: (drink: DrinkType, quantity: number) => void
  onLongPress: (drink: DrinkType) => void
  onEdit?: (drink: DrinkType) => void
}

function SortableItem({ drink, isEditing, editable, onQuickLog, onLongPress, onEdit }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: drink.id })

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFired = useRef(false)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const handlePointerDown = useCallback(() => {
    longPressFired.current = false
    clearTimer()
    timerRef.current = setTimeout(() => {
      longPressFired.current = true
      if (typeof window !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(30)
      }
      onLongPress(drink)
    }, LONG_PRESS_MS)
  }, [clearTimer, drink, onLongPress])

  const handleClick = useCallback(() => {
    if (longPressFired.current) {
      longPressFired.current = false
      return
    }
    onQuickLog(drink, 1)
  }, [drink, onQuickLog])

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.6 : 1,
    touchAction: isEditing ? 'none' : undefined,
  }

  return (
    <div ref={setNodeRef} style={style}>
      {isEditing ? (
        <div
          {...attributes}
          {...listeners}
          className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-colors cursor-grab active:cursor-grabbing select-none ${
            isDragging
              ? 'bg-zinc-800 border-zinc-600 shadow-lg shadow-black/40'
              : 'bg-zinc-900 border-zinc-700 border-dashed'
          }`}
        >
          <div className="relative w-full flex items-center justify-center">
            {editable && (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit?.(drink)
                }}
                className="absolute left-0 -top-1 p-1 rounded-md text-zinc-500 hover:text-zinc-200 bg-zinc-800/80"
                aria-label={`Edit ${drink.name}`}
              >
                <Pencil className="w-3 h-3" />
              </button>
            )}
            <DrinkIcon icon={drink.icon} color={drink.color} imageUrl={drink.image_url} size={24} />
            <GripVertical className="absolute right-0 w-3.5 h-3.5 text-zinc-600" />
          </div>
          <span className="text-[11px] text-zinc-500 text-center leading-tight truncate w-full">
            {drink.name}
          </span>
        </div>
      ) : (
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={handleClick}
          onPointerDown={handlePointerDown}
          onPointerUp={clearTimer}
          onPointerLeave={clearTimer}
          onPointerCancel={clearTimer}
          onContextMenu={(e) => e.preventDefault()}
          className="flex flex-col items-center gap-2 p-3 rounded-xl bg-zinc-900 border border-zinc-800/60 active:bg-zinc-800 transition-colors w-full select-none"
        >
          <DrinkIcon icon={drink.icon} color={drink.color} imageUrl={drink.image_url} size={24} />
          <span className="text-[11px] text-zinc-500 text-center leading-tight truncate w-full">
            {drink.name}
          </span>
        </motion.button>
      )}
    </div>
  )
}

type QuantityPickerProps = {
  drink: DrinkType
  onConfirm: (quantity: number) => void
  onClose: () => void
}

function QuantityPicker({ drink, onConfirm, onClose }: QuantityPickerProps) {
  const [quantity, setQuantity] = useState(1)

  const totalUnits = (drink.standard_units || 0) * quantity

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-end justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        className="relative w-full max-w-md bg-zinc-900 border-t border-zinc-800 rounded-t-3xl p-6 pb-8 space-y-6"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <DrinkIcon icon={drink.icon} color={drink.color} imageUrl={drink.image_url} size={28} />
            <div className="min-w-0">
              <p className="text-base font-semibold text-zinc-100 truncate">{drink.name}</p>
              <p className="text-xs text-zinc-500">{totalUnits.toFixed(1)} units total</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-500 hover:text-zinc-300 rounded-lg transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center justify-center gap-6">
          <button
            onClick={() => setQuantity(q => Math.max(1, q - 1))}
            disabled={quantity <= 1}
            className="flex items-center justify-center w-12 h-12 rounded-full bg-zinc-800 text-zinc-200 active:bg-zinc-700 disabled:opacity-30 disabled:active:bg-zinc-800 transition-colors"
          >
            <Minus className="w-5 h-5" />
          </button>
          <span className="text-5xl font-bold tabular-nums text-zinc-50 w-20 text-center">{quantity}</span>
          <button
            onClick={() => setQuantity(q => Math.min(99, q + 1))}
            className="flex items-center justify-center w-12 h-12 rounded-full bg-zinc-800 text-zinc-200 active:bg-zinc-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map(n => (
            <button
              key={n}
              onClick={() => setQuantity(n)}
              className={`py-2 rounded-xl text-sm font-medium transition-colors ${
                quantity === n
                  ? 'bg-zinc-100 text-zinc-900'
                  : 'bg-zinc-800/60 text-zinc-400 active:bg-zinc-800'
              }`}
            >
              {n}
            </button>
          ))}
        </div>

        <button
          onClick={() => onConfirm(quantity)}
          className="w-full py-3.5 rounded-2xl bg-zinc-100 text-zinc-900 font-semibold active:bg-zinc-300 transition-colors"
        >
          Log {quantity}&times; {drink.name}
        </button>
      </motion.div>
    </motion.div>
  )
}

type SortableQuickLogGridProps = {
  drinks: DrinkType[]
  onReorder: (drinks: DrinkType[]) => void
  onQuickLog: (drink: DrinkType, quantity: number) => void
  onCreateDrink: (drink: NewDrinkInput) => Promise<boolean>
  onUpdateDrink: (id: string, drink: NewDrinkInput) => Promise<boolean>
  onDeleteDrink: (id: string) => Promise<boolean>
  userId: string | null
}

export function SortableQuickLogGrid({ drinks, onReorder, onQuickLog, onCreateDrink, onUpdateDrink, onDeleteDrink, userId }: SortableQuickLogGridProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [quantityTarget, setQuantityTarget] = useState<DrinkType | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editTarget, setEditTarget] = useState<DrinkType | null>(null)

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const d of drinks) {
      if (d.category) set.add(d.category)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [drinks])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor),
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const oldIndex = drinks.findIndex(d => d.id === active.id)
      const newIndex = drinks.findIndex(d => d.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return

      const reordered = arrayMove(drinks, oldIndex, newIndex)
      onReorder(reordered)
    },
    [drinks, onReorder],
  )

  const filteredDrinks = useMemo(() => {
    const q = query.trim().toLowerCase()
    return drinks.filter(d => {
      const matchesCategory = category === 'all' || d.category === category
      if (!matchesCategory) return false
      if (!q) return true
      return (
        d.name.toLowerCase().includes(q) ||
        (d.category?.toLowerCase().includes(q) ?? false)
      )
    })
  }, [drinks, query, category])

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Quick log</h2>
        <button
          onClick={() => {
            setIsEditing(prev => !prev)
            setQuery('')
            setCategory('all')
          }}
          className="text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1 rounded-lg hover:bg-zinc-800/60"
        >
          {isEditing ? 'Done' : 'Edit'}
        </button>
      </div>

      {!isEditing && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 pointer-events-none" />
            <input
              type="text"
              inputMode="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search drinks"
              className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800/60 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-600 hover:text-zinc-300 rounded-md transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="relative shrink-0">
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800/60 text-sm text-zinc-200 focus:outline-none focus:border-zinc-700 transition-colors cursor-pointer capitalize"
            >
              <option value="all">All</option>
              {categories.map(cat => (
                <option key={cat} value={cat} className="capitalize">
                  {cat}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 pointer-events-none" />
          </div>
        </div>
      )}

      {isEditing && (
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 text-sm font-medium text-zinc-400 active:bg-zinc-800 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add drink
        </button>
      )}

      {isEditing ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={drinks.map(d => d.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-3 gap-3">
              {drinks.map(drink => (
                <SortableItem
                  key={drink.id}
                  drink={drink}
                  isEditing={true}
                  editable={!!userId && drink.created_by === userId}
                  onQuickLog={onQuickLog}
                  onLongPress={setQuantityTarget}
                  onEdit={setEditTarget}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : filteredDrinks.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-zinc-600">
            {query ? <>No drinks match &ldquo;{query}&rdquo;</> : 'No drinks in this category'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {filteredDrinks.map(drink => (
            <SortableItem
              key={drink.id}
              drink={drink}
              isEditing={false}
              onQuickLog={onQuickLog}
              onLongPress={setQuantityTarget}
            />
          ))}
        </div>
      )}

      {!isEditing && (
        <p className="text-[11px] text-zinc-600 text-center pt-1">Tap to log 1 &middot; hold to choose amount</p>
      )}

      <AnimatePresence>
        {quantityTarget && (
          <QuantityPicker
            key={quantityTarget.id}
            drink={quantityTarget}
            onClose={() => setQuantityTarget(null)}
            onConfirm={(quantity) => {
              onQuickLog(quantityTarget, quantity)
              setQuantityTarget(null)
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(showAddModal || editTarget) && (
          <AddDrinkModal
            key={editTarget?.id ?? 'new'}
            categories={categories}
            userId={userId}
            drink={editTarget}
            onClose={() => {
              setShowAddModal(false)
              setEditTarget(null)
            }}
            onCreate={onCreateDrink}
            onUpdate={onUpdateDrink}
            onDelete={onDeleteDrink}
          />
        )}
      </AnimatePresence>
    </section>
  )
}
