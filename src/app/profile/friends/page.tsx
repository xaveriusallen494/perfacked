'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Loader2, UserPlus, Search, Check, X, UserMinus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

type Profile = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

type Friend = {
  friendshipId: string
  profile: Profile
}

export default function ManageFriendsPage() {
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [friends, setFriends] = useState<Friend[]>([])
  const [incoming, setIncoming] = useState<Friend[]>([])
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set())

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Profile[]>([])
  const [searching, setSearching] = useState(false)

  const supabase = createClient()

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
        .select(`
          id, requester_id, addressee_id, status,
          requester:profiles!requester_id(id, username, display_name, avatar_url),
          addressee:profiles!addressee_id(id, username, display_name, avatar_url)
        `)
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)

      const accepted: Friend[] = []
      const incomingReqs: Friend[] = []
      const pending = new Set<string>()
      const friendSet = new Set<string>()

      if (friendships) {
        for (const f of friendships as any[]) {
          const other: Profile = f.requester_id === user.id ? f.addressee : f.requester
          if (!other) continue
          if (f.status === 'accepted') {
            accepted.push({ friendshipId: f.id, profile: other })
            friendSet.add(other.id)
          } else if (f.status === 'pending') {
            if (f.addressee_id === user.id) {
              incomingReqs.push({ friendshipId: f.id, profile: other })
            } else {
              pending.add(other.id)
            }
          }
        }
      }

      setFriends(accepted)
      setIncoming(incomingReqs)
      setPendingIds(pending)
      setFriendIds(friendSet)
      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    const q = searchQuery.trim()
    if (!q) {
      setSearchResults([])
      setSearching(false)
      return
    }

    setSearching(true)
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
        .limit(15)

      setSearchResults((data || []).filter(p => p.id !== userId) as Profile[])
      setSearching(false)
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery, userId, supabase])

  const sendFriendRequest = async (target: Profile) => {
    if (!userId) return
    const { error } = await supabase
      .from('friendships')
      .insert({ requester_id: userId, addressee_id: target.id })

    if (error) {
      toast.error(error.code === '23505' ? 'Friend request already sent' : 'Failed to send request')
      return
    }
    setPendingIds(prev => new Set(prev).add(target.id))
    toast.success('Friend request sent!')
  }

  const acceptRequest = async (req: Friend) => {
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', req.friendshipId)

    if (error) {
      toast.error('Failed to accept request')
      return
    }
    setIncoming(prev => prev.filter(r => r.friendshipId !== req.friendshipId))
    setFriends(prev => [...prev, req])
    setFriendIds(prev => new Set(prev).add(req.profile.id))
    toast.success('Friend added!')
  }

  const declineRequest = async (req: Friend) => {
    const { error } = await supabase.from('friendships').delete().eq('id', req.friendshipId)
    if (error) {
      toast.error('Failed to decline request')
      return
    }
    setIncoming(prev => prev.filter(r => r.friendshipId !== req.friendshipId))
    toast.success('Request declined')
  }

  const removeFriend = async (friend: Friend) => {
    const { error } = await supabase.from('friendships').delete().eq('id', friend.friendshipId)
    if (error) {
      toast.error('Failed to remove friend')
      return
    }
    setFriends(prev => prev.filter(f => f.friendshipId !== friend.friendshipId))
    setFriendIds(prev => {
      const next = new Set(prev)
      next.delete(friend.profile.id)
      return next
    })
    toast.success('Friend removed')
  }

  const isSearching = searchQuery.trim().length > 0

  return (
    <div className="flex flex-col min-h-full px-5 pt-6 pb-[calc(env(safe-area-inset-bottom)+6rem)] space-y-6 max-w-md mx-auto">
      <header className="flex items-center gap-3">
        <Link
          href="/profile"
          className="flex items-center justify-center w-9 h-9 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
          aria-label="Back to profile"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-zinc-50">Friends</h1>
      </header>

      {/* Add friends search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
        <Input
          placeholder="Find people by username..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          className="pl-9 h-10 bg-zinc-900 border-zinc-800/60 text-zinc-100 placeholder:text-zinc-600 rounded-xl focus:border-zinc-600"
        />
      </div>

      {loading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
        </div>
      ) : isSearching ? (
        <section className="space-y-2">
          {searching ? (
            <div className="py-8 flex justify-center">
              <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" />
            </div>
          ) : searchResults.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Search className="w-10 h-10 text-zinc-700 mx-auto" />
              <p className="text-sm text-zinc-500">No users found</p>
              <p className="text-xs text-zinc-600">Try a different username or name</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {searchResults.map((person) => {
                const isFriend = friendIds.has(person.id)
                const isPending = pendingIds.has(person.id)
                return (
                  <motion.div
                    key={person.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900 border border-zinc-800/60"
                  >
                    <Avatar className="w-9 h-9 border border-zinc-800">
                      <AvatarImage src={person.avatar_url || undefined} />
                      <AvatarFallback className="bg-zinc-800 text-zinc-400 text-xs">
                        {(person.display_name || person.username || '?').charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-200 truncate">
                        {person.display_name || person.username || 'Unknown'}
                      </p>
                      {person.username && (
                        <p className="text-xs text-zinc-600 truncate">@{person.username}</p>
                      )}
                    </div>
                    {isFriend ? (
                      <span className="flex items-center gap-1 text-xs text-zinc-500">
                        <Check className="w-3.5 h-3.5" /> Friends
                      </span>
                    ) : isPending ? (
                      <span className="text-xs text-zinc-500">Pending</span>
                    ) : (
                      <button
                        onClick={() => sendFriendRequest(person)}
                        className="flex items-center gap-1.5 px-3 h-9 rounded-lg bg-amber-500 text-zinc-950 text-sm font-medium active:scale-95 transition-transform"
                      >
                        <UserPlus className="w-4 h-4" /> Add
                      </button>
                    )}
                  </motion.div>
                )
              })}
            </div>
          )}
        </section>
      ) : (
        <>
          {/* Incoming requests */}
          {incoming.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
                Requests <span className="text-zinc-600">({incoming.length})</span>
              </h2>
              <div className="flex flex-col gap-2">
                <AnimatePresence>
                  {incoming.map((req) => (
                    <motion.div
                      key={req.friendshipId}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900 border border-zinc-800/60"
                    >
                      <Avatar className="w-9 h-9 border border-zinc-800">
                        <AvatarImage src={req.profile.avatar_url || undefined} />
                        <AvatarFallback className="bg-zinc-800 text-zinc-400 text-xs">
                          {(req.profile.display_name || req.profile.username || '?').charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-200 truncate">
                          {req.profile.display_name || req.profile.username || 'Unknown'}
                        </p>
                        <p className="text-xs text-zinc-600">wants to be friends</p>
                      </div>
                      <button
                        onClick={() => acceptRequest(req)}
                        className="flex items-center justify-center w-9 h-9 rounded-lg bg-amber-500 text-zinc-950 active:scale-95 transition-transform"
                        aria-label="Accept"
                      >
                        <Check className="w-4 h-4" strokeWidth={3} />
                      </button>
                      <button
                        onClick={() => declineRequest(req)}
                        className="flex items-center justify-center w-9 h-9 rounded-lg bg-zinc-800 text-zinc-400 active:scale-95 transition-transform"
                        aria-label="Decline"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </section>
          )}

          {/* Friends list */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
              Your friends <span className="text-zinc-600">({friends.length})</span>
            </h2>
            {friends.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <UserPlus className="w-10 h-10 text-zinc-700 mx-auto" />
                <p className="text-sm text-zinc-500">No friends yet</p>
                <p className="text-xs text-zinc-600">Use the search above to find people</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <AnimatePresence>
                  {friends.map((friend) => (
                    <motion.div
                      key={friend.friendshipId}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900 border border-zinc-800/60"
                    >
                      <Avatar className="w-9 h-9 border border-zinc-800">
                        <AvatarImage src={friend.profile.avatar_url || undefined} />
                        <AvatarFallback className="bg-zinc-800 text-zinc-400 text-xs">
                          {(friend.profile.display_name || friend.profile.username || '?').charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-200 truncate">
                          {friend.profile.display_name || friend.profile.username || 'Unknown'}
                        </p>
                        {friend.profile.username && (
                          <p className="text-xs text-zinc-600 truncate">@{friend.profile.username}</p>
                        )}
                      </div>
                      <button
                        onClick={() => removeFriend(friend)}
                        className="flex items-center justify-center w-9 h-9 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        aria-label="Remove friend"
                      >
                        <UserMinus className="w-4 h-4" />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
