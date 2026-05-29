'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, LogOut, Save, Calendar, Camera } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { v4 as uuidv4 } from 'uuid'
import { toast } from 'sonner'
import { DrinkIcon } from '@/components/DrinkIcon'

type Profile = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  created_at: string
}

type TopDrink = {
  name: string
  icon: string
  color: string
  image_url?: string | null
  count: number
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [email, setEmail] = useState('')
  const [totalDrinks, setTotalDrinks] = useState(0)
  const [totalUnits, setTotalUnits] = useState(0)
  const [topDrinks, setTopDrinks] = useState<TopDrink[]>([])
  const [friendCount, setFriendCount] = useState(0)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }
      setEmail(user.email || '')

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (profileData) {
        setProfile(profileData)
        setDisplayName(profileData.display_name || '')
        setUsername(profileData.username || '')
        setBio(profileData.bio || '')
        setAvatarUrl(profileData.avatar_url || null)
      }

      // Total consumption stats
      const { data: allLogs } = await supabase
        .from('consumptions')
        .select('quantity, drink_type:drink_types(name, icon, color, standard_units, image_url)')
        .eq('user_id', user.id)

      if (allLogs) {
        setTotalDrinks(allLogs.length)
        setTotalUnits(
          Math.round(
            allLogs.reduce((sum, l) => sum + ((l.drink_type as any)?.standard_units || 0) * l.quantity, 0) * 10
          ) / 10
        )

        const drinkCounts: Record<string, { name: string; icon: string; color: string; image_url?: string | null; count: number }> = {}
        for (const log of allLogs) {
          const dt = log.drink_type as any
          if (dt?.name) {
            if (!drinkCounts[dt.name]) {
              drinkCounts[dt.name] = { name: dt.name, icon: dt.icon, color: dt.color, image_url: dt.image_url, count: 0 }
            }
            drinkCounts[dt.name].count += log.quantity
          }
        }
        const sorted = Object.values(drinkCounts).sort((a, b) => b.count - a.count).slice(0, 3)
        setTopDrinks(sorted)
      }

      // Friend count
      const { count } = await supabase
        .from('friendships')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'accepted')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)

      setFriendCount(count || 0)

      setLoading(false)
    }
    init()
  }, [])

  const handleAvatarUpload = async (file: File) => {
    if (!profile) return
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
      const path = `${profile.id}/${uuidv4()}.${ext}`
      const { error } = await supabase.storage
        .from('avatars')
        .upload(path, file, { cacheControl: '3600', upsert: true })

      if (error) {
        toast.error('Upload failed')
        return
      }

      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      setAvatarUrl(data.publicUrl)
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    if (!profile) return

    const trimmedUsername = username.trim()
    if (trimmedUsername && !/^[a-zA-Z0-9_.]{3,20}$/.test(trimmedUsername)) {
      toast.error('Username must be 3–20 chars: letters, numbers, _ or .')
      return
    }

    setSaving(true)

    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: displayName.trim() || null,
        username: trimmedUsername || null,
        bio: bio.trim() || null,
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', profile.id)

    if (error) {
      if (error.code === '23505') {
        toast.error('That username is already taken')
      } else {
        toast.error('Failed to save profile')
      }
    } else {
      setProfile(prev => prev ? {
        ...prev,
        display_name: displayName.trim() || null,
        username: trimmedUsername || null,
        bio: bio.trim() || null,
        avatar_url: avatarUrl,
      } : prev)
      setEditing(false)
      toast.success('Profile updated')
    }
    setSaving(false)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-full px-5">
        <div className="text-center space-y-3">
          <p className="text-zinc-400">Could not load profile</p>
          <Button
            onClick={handleSignOut}
            variant="outline"
            className="border-zinc-800/60 text-zinc-400"
          >
            Sign out
          </Button>
        </div>
      </div>
    )
  }

  const memberSince = new Date(profile.created_at).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="flex flex-col h-full px-5 pt-6 pb-24 space-y-6 max-w-md mx-auto">
      <header>
        <h1 className="text-2xl font-bold text-zinc-50">Profile</h1>
      </header>

      {/* Avatar + name */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4"
      >
        <Avatar className="w-16 h-16 border-2 border-zinc-800">
          <AvatarImage src={profile.avatar_url || undefined} />
          <AvatarFallback className="bg-zinc-800 text-zinc-400 text-xl">
            {(profile.display_name || profile.username || '?').charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-zinc-100 truncate">
            {profile.display_name || profile.username || 'User'}
          </h2>
          {profile.username && (
            <p className="text-sm text-zinc-500">@{profile.username}</p>
          )}
          {profile.bio && !editing && (
            <p className="text-sm text-zinc-400 mt-0.5 line-clamp-2">{profile.bio}</p>
          )}
        </div>
      </motion.div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-4 text-center">
          <p className="text-2xl font-bold text-zinc-50 tabular-nums">{totalDrinks}</p>
          <p className="text-xs text-zinc-500 mt-0.5">drinks</p>
        </div>
        <div className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-4 text-center">
          <p className="text-2xl font-bold text-zinc-50 tabular-nums">{totalUnits}</p>
          <p className="text-xs text-zinc-500 mt-0.5">total units</p>
        </div>
        <div className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-4 text-center">
          <p className="text-2xl font-bold text-zinc-50 tabular-nums">{friendCount}</p>
          <p className="text-xs text-zinc-500 mt-0.5">friends</p>
        </div>
      </div>

      {/* Top drinks */}
      {topDrinks.length > 0 && (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Top drinks</h3>
          <div className="space-y-2.5">
            {topDrinks.map((drink, i) => (
              <div key={drink.name} className="flex items-center gap-3">
                <span className="text-xs text-zinc-600 w-4 tabular-nums">{i + 1}</span>
                <DrinkIcon icon={drink.icon} color={drink.color} imageUrl={drink.image_url} size={16} />
                <p className="text-sm text-zinc-300 flex-1">{drink.name}</p>
                <p className="text-sm text-zinc-500 tabular-nums">{drink.count}x</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit form */}
      {editing ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-4 space-y-4"
        >
          <div className="flex flex-col items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleAvatarUpload(file)
                e.target.value = ''
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="relative group rounded-full"
            >
              <Avatar className="w-20 h-20 border-2 border-zinc-800">
                <AvatarImage src={avatarUrl || undefined} />
                <AvatarFallback className="bg-zinc-800 text-zinc-400 text-2xl">
                  {(displayName || username || '?').charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                {uploading ? (
                  <Loader2 className="w-5 h-5 text-zinc-100 animate-spin" />
                ) : (
                  <Camera className="w-5 h-5 text-zinc-100" />
                )}
              </span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              {uploading ? 'Uploading…' : 'Change photo'}
            </button>
          </div>
          <div className="space-y-2">
            <Label className="text-zinc-400 text-sm">Display name</Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              className="h-10 bg-zinc-950 border-zinc-800/60 text-zinc-100 rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-zinc-400 text-sm">Username</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">@</span>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="username"
                maxLength={20}
                autoCapitalize="none"
                autoCorrect="off"
                className="h-10 pl-7 bg-zinc-950 border-zinc-800/60 text-zinc-100 rounded-xl"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-zinc-400 text-sm">Bio</Label>
            <Input
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="A short bio..."
              maxLength={120}
              className="h-10 bg-zinc-950 border-zinc-800/60 text-zinc-100 rounded-xl"
            />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 h-10 rounded-xl bg-zinc-100 text-zinc-900 font-semibold hover:bg-zinc-200"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
              Save
            </Button>
            <Button
              onClick={() => {
                setEditing(false)
                setDisplayName(profile.display_name || '')
                setUsername(profile.username || '')
                setBio(profile.bio || '')
                setAvatarUrl(profile.avatar_url || null)
              }}
              variant="outline"
              className="h-10 rounded-xl border-zinc-800/60 text-zinc-400"
            >
              Cancel
            </Button>
          </div>
        </motion.div>
      ) : (
        <Button
          onClick={() => setEditing(true)}
          variant="outline"
          className="w-full h-11 rounded-xl border-zinc-800/60 text-zinc-300 hover:bg-zinc-900"
        >
          Edit profile
        </Button>
      )}

      {/* Account info */}
      <div className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Account</h3>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-sm text-zinc-500">Email</span>
            <span className="text-sm text-zinc-300">{email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-zinc-500">Member since</span>
            <span className="text-sm text-zinc-300 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              {memberSince}
            </span>
          </div>
        </div>
      </div>

      {/* Sign out */}
      <Button
        onClick={handleSignOut}
        variant="outline"
        className="w-full h-11 rounded-xl border-red-500/20 text-red-400 hover:bg-red-500/10 hover:text-red-300"
      >
        <LogOut className="w-4 h-4 mr-2" />
        Sign out
      </Button>
    </div>
  )
}
