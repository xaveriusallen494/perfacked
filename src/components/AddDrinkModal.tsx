'use client'

import { useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { X, Upload, Check, Loader2, Trash2, Beer, Wine, Martini, GlassWater } from 'lucide-react'
import { DrinkIcon } from '@/components/DrinkIcon'
import { createClient } from '@/lib/supabase/client'
import { v4 as uuidv4 } from 'uuid'
import { toast } from 'sonner'
import type { DrinkType } from '@/lib/store/useSipStore'

export type NewDrinkInput = {
  name: string
  category: string
  volume_ml: number
  alcohol_percentage: number
  standard_units: number
  icon: string
  color: string
  image_url: string | null
}

// Preset artwork shipped in /public/drinks
const PRESET_IMAGES = [
  '/drinks/stella.png', '/drinks/duvel.png', '/drinks/leffe.png', '/drinks/chouffe.png',
  '/drinks/chimay.png', '/drinks/chimay-bleue.jpg', '/drinks/karmeliet.png', '/drinks/orval.png',
  '/drinks/ouden.png', '/drinks/kriek.png', '/drinks/kwaremont.png', '/drinks/fourchette.png',
  '/drinks/augustijn.png', '/drinks/baptist.png', '/drinks/gentse-trippel.png', '/drinks/vedette.png',
  '/drinks/trippel.webp', '/drinks/rochefort-10.jpg', '/drinks/westmalle-tripel.jpg', '/drinks/aperol.png',
  '/drinks/red.png', '/drinks/white.png', '/drinks/rose.webp', '/drinks/whiskey.png',
]

const ICON_OPTIONS: { value: string; Icon: React.FC<{ className?: string }> }[] = [
  { value: 'Beer', Icon: Beer },
  { value: 'Wine', Icon: Wine },
  { value: 'Martini', Icon: Martini },
  { value: 'GlassWater', Icon: GlassWater },
]

const COLOR_OPTIONS = ['#F59E0B', '#FCD34D', '#D97706', '#9F1239', '#BE123C', '#EC4899', '#E2E8F0', '#78350F']

// 1 standard unit = 12.5 ml of pure alcohol (matches the existing catalog values)
function computeUnits(volumeMl: number, abv: number): number {
  if (!volumeMl || !abv) return 0
  return Math.round(((volumeMl * (abv / 100)) / 12.5) * 100) / 100
}

type AddDrinkModalProps = {
  categories: string[]
  userId: string | null
  /** When provided the modal edits this drink instead of creating a new one. */
  drink?: DrinkType | null
  onClose: () => void
  onCreate: (drink: NewDrinkInput) => Promise<boolean>
  onUpdate?: (id: string, drink: NewDrinkInput) => Promise<boolean>
  onDelete?: (id: string) => Promise<boolean>
}

export function AddDrinkModal({ categories, userId, drink, onClose, onCreate, onUpdate, onDelete }: AddDrinkModalProps) {
  const isEditing = !!drink
  const [name, setName] = useState(drink?.name ?? '')
  const [category, setCategory] = useState(drink?.category ?? '')
  const [volume, setVolume] = useState(drink ? String(drink.volume_ml) : '330')
  const [abv, setAbv] = useState(drink ? String(drink.alcohol_percentage) : '5.0')
  const [icon, setIcon] = useState(drink?.icon || 'Beer')
  const [color, setColor] = useState(drink?.color || '#F59E0B')
  const [imageUrl, setImageUrl] = useState<string | null>(drink?.image_url ?? null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = useMemo(() => createClient(), [])

  const volumeMl = parseFloat(volume) || 0
  const abvNum = parseFloat(abv) || 0
  const units = computeUnits(volumeMl, abvNum)

  const canSubmit = name.trim().length > 0 && volumeMl > 0 && abvNum >= 0 && !saving && !uploading && !deleting

  const handleUpload = async (file: File) => {
    if (!userId) {
      toast.error('You need to be logged in to upload')
      return
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5 MB')
      return
    }

    setUploading(true)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
      const path = `${userId}/${uuidv4()}.${ext}`
      const { error } = await supabase.storage
        .from('drink-images')
        .upload(path, file, { cacheControl: '3600', upsert: false })

      if (error) {
        toast.error('Upload failed')
        return
      }

      const { data } = supabase.storage.from('drink-images').getPublicUrl(path)
      setImageUrl(data.publicUrl)
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSaving(true)
    const payload: NewDrinkInput = {
      name: name.trim(),
      category: category.trim() || 'Other',
      volume_ml: Math.round(volumeMl),
      alcohol_percentage: abvNum,
      standard_units: units,
      icon,
      color,
      image_url: imageUrl,
    }
    const ok = drink && onUpdate ? await onUpdate(drink.id, payload) : await onCreate(payload)
    setSaving(false)
    if (ok) onClose()
  }

  const handleDelete = async () => {
    if (!drink || !onDelete || deleting) return
    setDeleting(true)
    const ok = await onDelete(drink.id)
    setDeleting(false)
    if (ok) onClose()
  }

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-end justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        className="relative w-full max-w-md bg-zinc-900 border-t border-zinc-800 rounded-t-3xl p-6 pb-8 space-y-5 max-h-[90vh] overflow-y-auto"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <DrinkIcon icon={icon} color={color} imageUrl={imageUrl} size={28} />
            <p className="text-base font-semibold text-zinc-100">{isEditing ? 'Edit drink' : 'New drink'}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-500 hover:text-zinc-300 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Image picker */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Image</label>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) handleUpload(file)
                e.target.value = ''
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="shrink-0 flex flex-col items-center justify-center gap-1 w-16 h-16 rounded-xl border border-dashed border-zinc-700 bg-zinc-800/40 text-zinc-400 active:bg-zinc-800 transition-colors"
            >
              {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
              <span className="text-[10px]">Upload</span>
            </button>

            {PRESET_IMAGES.map(src => {
              const selected = imageUrl === src
              return (
                <button
                  key={src}
                  type="button"
                  onClick={() => setImageUrl(selected ? null : src)}
                  className={`relative shrink-0 w-16 h-16 rounded-xl border flex items-center justify-center overflow-hidden transition-colors ${
                    selected ? 'border-zinc-100 bg-zinc-800' : 'border-zinc-800 bg-zinc-800/40'
                  }`}
                >
                  <DrinkIcon icon={icon} color={color} imageUrl={src} size={28} />
                  {selected && (
                    <span className="absolute top-1 right-1 bg-zinc-100 rounded-full p-0.5">
                      <Check className="w-2.5 h-2.5 text-zinc-900" />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Fallback icon + color (used when no image) */}
        {!imageUrl && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Icon</label>
              <div className="flex gap-2">
                {ICON_OPTIONS.map(({ value, Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setIcon(value)}
                    className={`flex items-center justify-center w-9 h-9 rounded-lg border transition-colors ${
                      icon === value
                        ? 'border-zinc-100 text-zinc-100 bg-zinc-800'
                        : 'border-zinc-800 text-zinc-500 bg-zinc-800/40'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Color</label>
              <div className="flex flex-wrap gap-1.5">
                {COLOR_OPTIONS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    style={{ backgroundColor: c }}
                    className={`w-6 h-6 rounded-full border-2 transition-transform ${
                      color === c ? 'border-zinc-100 scale-110' : 'border-transparent'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Name */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Tripel Karmeliet"
            className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-800/60 border border-zinc-700/60 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
          />
        </div>

        {/* Category */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Category</label>
          <input
            type="text"
            list="drink-categories"
            value={category}
            onChange={e => setCategory(e.target.value)}
            placeholder="e.g. Tripel"
            className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-800/60 border border-zinc-700/60 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
          />
          <datalist id="drink-categories">
            {categories.map(c => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>

        {/* Volume + ABV */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Volume (ml)</label>
            <input
              type="number"
              inputMode="numeric"
              value={volume}
              onChange={e => setVolume(e.target.value)}
              min={0}
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-800/60 border border-zinc-700/60 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600 transition-colors"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">ABV (%)</label>
            <input
              type="number"
              inputMode="decimal"
              value={abv}
              onChange={e => setAbv(e.target.value)}
              min={0}
              step={0.1}
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-800/60 border border-zinc-700/60 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600 transition-colors"
            />
          </div>
        </div>

        <p className="text-xs text-zinc-500 text-center">
          &asymp; <span className="text-zinc-300 font-medium tabular-nums">{units.toFixed(1)}</span> standard units per drink
        </p>

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full py-3.5 rounded-2xl bg-zinc-100 text-zinc-900 font-semibold active:bg-zinc-300 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {isEditing ? (saving ? 'Saving…' : 'Save changes') : (saving ? 'Adding…' : 'Add drink')}
        </button>

        {isEditing && onDelete && (
          <button
            onClick={handleDelete}
            disabled={deleting || saving}
            className="w-full py-3 rounded-2xl text-red-400 font-medium active:bg-red-500/10 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {deleting ? 'Deleting…' : 'Delete drink'}
          </button>
        )}
      </motion.div>
    </motion.div>
  )
}
