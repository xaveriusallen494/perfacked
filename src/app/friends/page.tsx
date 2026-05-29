'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Heart, Loader2, UserPlus, Search } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { DrinkIcon } from '@/components/DrinkIcon'

type Profile = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

type DrinkType = {
  name: string
  icon: string
  color: string
  standard_units: number
  image_url?: string | null
}

type FeedItem = {
  id: string
  user_id: string
  consumed_at: string
  quantity: number
  profile: Profile
  drink_type: DrinkType
  reaction_count: number
  has_reacted: boolean
}

export default function FriendsFeed() {
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set())
  const [pendingRequests, setPendingRequests] = useState<Set<string>>(new Set())

  const supabase = createClient()

  const fetchFeed = useCallback(async (currentUserId: string, acceptedFriendIds: Set<string>) => {
    const feedUserIds = [currentUserId, ...acceptedFriendIds]

    const { data: consumptions, error } = await supabase
      .from('consumptions')
      .select(`
        id,
        user_id,
        consumed_at,
        quantity,
        profile:profiles!user_id(id, username, display_name, avatar_url),
        drink_type:drink_types!drink_type_id(name, icon, color, standard_units, image_url)
      `)
      .in('user_id', feedUserIds)
      .order('consumed_at', { ascending: false })
      .limit(30)

    if (error) {
      toast.error('Failed to load feed')
      return
    }

    if (!consumptions) return

    const consumptionIds = consumptions.map(c => c.id)

    let reactionCounts: Record<string, number> = {}
    let userReactions: Set<string> = new Set()

    if (consumptionIds.length > 0) {
      const { data: reactions } = await supabase
        .from('drink_reactions')
        .select('consumption_id, user_id')
        .in('consumption_id', consumptionIds)

      if (reactions) {
        for (const r of reactions) {
          reactionCounts[r.consumption_id] = (reactionCounts[r.consumption_id] || 0) + 1
          if (r.user_id === currentUserId) {
            userReactions.add(r.consumption_id)
          }
        }
      }
    }

    const items: FeedItem[] = consumptions.map(c => ({
      id: c.id,
      user_id: c.user_id,
      consumed_at: c.consumed_at,
      quantity: c.quantity,
      profile: c.profile as unknown as Profile,
      drink_type: c.drink_type as unknown as DrinkType,
      reaction_count: reactionCounts[c.id] || 0,
      has_reacted: userReactions.has(c.id),
    }))

    setFeed(items)
  }, [supabase])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }
      setUserId(user.id)

      const { data: friendships } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id, status')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)

      const accepted = new Set<string>()
      const pending = new Set<string>()

      if (friendships) {
        for (const f of friendships) {
          const otherId = f.requester_id === user.id ? f.addressee_id : f.requester_id
          if (f.status === 'accepted') {
            accepted.add(otherId)
          } else if (f.status === 'pending') {
            pending.add(otherId)
          }
        }
      }

      setFriendIds(accepted)
      setPendingRequests(pending)
      await fetchFeed(user.id, accepted)
      setLoading(false)
    }
    init()
  }, [])

  const toggleReaction = async (consumptionId: string) => {
    if (!userId) return

    if (typeof window !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(20)
    }

    const item = feed.find(f => f.id === consumptionId)
    if (!item) return

    const wasReacted = item.has_reacted

    setFeed(prev => prev.map(f => {
      if (f.id === consumptionId) {
        return {
          ...f,
          has_reacted: !wasReacted,
          reaction_count: wasReacted ? f.reaction_count - 1 : f.reaction_count + 1,
        }
      }
      return f
    }))

    if (wasReacted) {
      const { error } = await supabase
        .from('drink_reactions')
        .delete()
        .eq('consumption_id', consumptionId)
        .eq('user_id', userId)
        .eq('emoji', '❤️')
      if (error) {
        setFeed(prev => prev.map(f =>
          f.id === consumptionId ? { ...f, has_reacted: true, reaction_count: f.reaction_count + 1 } : f
        ))
        toast.error('Failed to remove reaction')
      }
    } else {
      const { error } = await supabase
        .from('drink_reactions')
        .insert({ consumption_id: consumptionId, user_id: userId, emoji: '❤️' })
      if (error) {
        setFeed(prev => prev.map(f =>
          f.id === consumptionId ? { ...f, has_reacted: false, reaction_count: f.reaction_count - 1 } : f
        ))
        toast.error('Failed to add reaction')
      }
    }
  }

  const sendFriendRequest = async (targetUserId: string) => {
    if (!userId) return

    const { error } = await supabase
      .from('friendships')
      .insert({ requester_id: userId, addressee_id: targetUserId })

    if (error) {
      if (error.code === '23505') {
        toast.error('Friend request already sent')
      } else {
        toast.error('Failed to send request')
      }
      return
    }

    setPendingRequests(prev => new Set(prev).add(targetUserId))
    toast.success('Friend request sent!')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
      </div>
    )
  }

  const filteredFeed = searchQuery
    ? feed.filter(item =>
        item.profile?.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.profile?.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.drink_type?.name?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : feed

  return (
    <div className="flex flex-col h-full px-5 pt-6 pb-24 space-y-6 max-w-md mx-auto">
      <header>
        <h1 className="text-2xl font-bold text-zinc-50">Friends</h1>
        <p className="text-zinc-500 text-sm mt-0.5">See what others are drinking</p>
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
        <Input
          placeholder="Search feed..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-10 bg-zinc-900 border-zinc-800/60 text-zinc-100 placeholder:text-zinc-600 rounded-xl focus:border-zinc-600"
        />
      </div>

      {filteredFeed.length === 0 ? (
        <div className="py-12 text-center space-y-3">
          <UserPlus className="w-10 h-10 text-zinc-700 mx-auto" />
          <div>
            <p className="text-sm text-zinc-500">No activity yet</p>
            <p className="text-xs text-zinc-600 mt-1">
              {feed.length === 0 ? 'Add friends to see their drinks here' : 'No results match your search'}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <AnimatePresence>
            {filteredFeed.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: i * 0.03 }}
                className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-4"
              >
                <div className="flex items-center gap-3 mb-3">
                  <Avatar className="w-9 h-9 border border-zinc-800">
                    <AvatarImage src={item.profile?.avatar_url || undefined} />
                    <AvatarFallback className="bg-zinc-800 text-zinc-400 text-xs">
                      {(item.profile?.display_name || item.profile?.username || '?').charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-200">
                      {item.profile?.display_name || item.profile?.username || 'Unknown'}
                      {item.user_id === userId && (
                        <span className="text-xs text-zinc-600 ml-1.5">you</span>
                      )}
                    </p>
                    <p className="text-xs text-zinc-600">
                      {formatDistanceToNow(new Date(item.consumed_at), { addSuffix: true })}
                    </p>
                  </div>
                  {item.user_id !== userId && !friendIds.has(item.user_id) && !pendingRequests.has(item.user_id) && (
                    <button
                      onClick={() => sendFriendRequest(item.user_id)}
                      className="p-2 text-zinc-600 hover:text-zinc-400 transition-colors"
                    >
                      <UserPlus className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3 py-2.5 px-3 rounded-lg bg-zinc-950/60 border border-zinc-800/40 mb-3">
                  <DrinkIcon icon={item.drink_type?.icon} color={item.drink_type?.color} imageUrl={item.drink_type?.image_url} size={20} />
                  <p className="text-sm text-zinc-300">
                    Logged{item.quantity > 1 ? ` ${item.quantity}x` : ''} <span className="font-medium text-zinc-100">{item.drink_type?.name}</span>
                  </p>
                </div>

                <div className="flex items-center gap-5">
                  <button
                    onClick={() => toggleReaction(item.id)}
                    className={`flex items-center gap-1.5 text-sm transition-colors ${item.has_reacted ? 'text-red-400' : 'text-zinc-600 hover:text-zinc-400'}`}
                  >
                    <Heart className="w-4 h-4" fill={item.has_reacted ? 'currentColor' : 'none'} />
                    {item.reaction_count > 0 && (
                      <span className="tabular-nums">{item.reaction_count}</span>
                    )}
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
