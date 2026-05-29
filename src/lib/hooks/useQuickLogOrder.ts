'use client'

import { useCallback, useEffect, useState } from 'react'
import type { DrinkType } from '@/lib/store/useSipStore'

const STORAGE_KEY_PREFIX = 'siptrack:quick-log-order'

/**
 * Curated default order for the quick-log grid, by drink name.
 * Used for any user who hasn't manually reordered their grid yet.
 * Drinks not listed here are appended after these, in their DB order.
 */
const DEFAULT_ORDER = [
  'Stella Artois 25cl',
  'Stella Artois 50cl',
  'Jupiler 25cl',
  'Beer',
  'Beer (Pint)',
  'Stong Beer',
  'Ouden Duiker',
  'Fourchette',
  'Aperol Spritz',
  'Red Wine',
  'White Wine',
  'Rosé Wine',
  'Shot (Vodka/Tequila)',
  'Whiskey',
  'Cocktail',
  'Orval',
  'Leffe Blond',
  'Vedett IPA',
  'La Chouffe',
  'Kasteel Rouge',
  'Kriek',
]

function normalizeName(name: string) {
  return name.trim().toLowerCase()
}

/**
 * Orders drinks by the curated DEFAULT_ORDER (matched by name).
 * Any drinks not in the list keep their incoming (DB) order, appended at the end.
 */
function applyDefaultOrder(drinks: DrinkType[]): DrinkType[] {
  const rank = new Map(DEFAULT_ORDER.map((name, i) => [normalizeName(name), i]))
  return drinks
    .map((drink, i) => ({ drink, i }))
    .sort((a, b) => {
      const ra = rank.get(normalizeName(a.drink.name)) ?? Infinity
      const rb = rank.get(normalizeName(b.drink.name)) ?? Infinity
      if (ra !== rb) return ra - rb
      return a.i - b.i
    })
    .map(({ drink }) => drink)
}

function getStorageKey(userId: string | null) {
  return userId ? `${STORAGE_KEY_PREFIX}:${userId}` : null
}

function loadOrder(userId: string | null): string[] | null {
  if (typeof window === 'undefined') return null
  const key = getStorageKey(userId)
  if (!key) return null
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveOrder(userId: string | null, ids: string[]) {
  if (typeof window === 'undefined') return
  const key = getStorageKey(userId)
  if (!key) return
  localStorage.setItem(key, JSON.stringify(ids))
}

/**
 * Reorders drink types according to a stored ID list.
 * Any new drinks not in the stored order are appended at the end.
 */
function applyOrder(drinks: DrinkType[], storedIds: string[]): DrinkType[] {
  const map = new Map(drinks.map(d => [d.id, d]))
  const ordered: DrinkType[] = []

  for (const id of storedIds) {
    const drink = map.get(id)
    if (drink) {
      ordered.push(drink)
      map.delete(id)
    }
  }

  // Append any drinks not in the stored order
  for (const drink of map.values()) {
    ordered.push(drink)
  }

  return ordered
}

export function useQuickLogOrder(drinkTypes: DrinkType[], userId: string | null) {
  const [orderedDrinks, setOrderedDrinks] = useState<DrinkType[]>(drinkTypes)

  useEffect(() => {
    const stored = loadOrder(userId)
    if (stored && stored.length > 0) {
      setOrderedDrinks(applyOrder(drinkTypes, stored))
    } else {
      setOrderedDrinks(applyDefaultOrder(drinkTypes))
    }
  }, [drinkTypes, userId])

  const reorder = useCallback(
    (newOrder: DrinkType[]) => {
      setOrderedDrinks(newOrder)
      saveOrder(userId, newOrder.map(d => d.id))
    },
    [userId],
  )

  return { orderedDrinks, reorder }
}
