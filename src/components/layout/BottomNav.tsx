'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, CalendarDays, Users, Swords, BarChart3, UserCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export function BottomNav() {
  const pathname = usePathname()

  const tabs = [
    { name: 'Home', href: '/', icon: Home },
    { name: 'Log', href: '/consumptions', icon: CalendarDays },
    { name: 'Friends', href: '/friends', icon: Users },
    { name: 'Battle', href: '/battle', icon: Swords },
    { name: 'Stats', href: '/stats', icon: BarChart3 },
    { name: 'Profile', href: '/profile', icon: UserCircle },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-950/90 backdrop-blur-md border-t border-zinc-800/50 pb-safe">
      <div className="flex items-center justify-around h-14 max-w-md mx-auto">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href
          const Icon = tab.icon

          return (
            <Link
              key={tab.name}
              href={tab.href}
              className={cn(
                'flex flex-col items-center justify-center gap-1 w-full h-full transition-colors',
                isActive ? 'text-zinc-50' : 'text-zinc-600'
              )}
            >
              <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 1.8} />
              <span className="text-[10px] font-medium">{tab.name}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
