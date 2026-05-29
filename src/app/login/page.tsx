'use client'

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createClient } from "@/lib/supabase/client"
import { useState } from "react"
import { toast } from "sonner"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        toast.error(error.message)
      } else {
        toast.success("Successfully logged in!")
        window.location.href = "/"
      }
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSignUp = async () => {
    setIsLoading(true)

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: email.split('@')[0],
          }
        }
      })

      if (error) {
        toast.error(error.message)
      } else {
        toast.success("Check your email for the confirmation link!")
      }
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex h-[100dvh] w-full items-center justify-center px-5">
      <div className="w-full max-w-sm space-y-8">
        {/* Branding */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-zinc-50">SipTrack</h1>
          <p className="text-sm text-zinc-500">Sign in to start tracking</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-zinc-400 text-sm">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 bg-zinc-900 border-zinc-800/60 text-zinc-100 placeholder:text-zinc-600 rounded-xl focus:border-zinc-600"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-zinc-400 text-sm">Password</Label>
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 bg-zinc-900 border-zinc-800/60 text-zinc-100 placeholder:text-zinc-600 rounded-xl focus:border-zinc-600"
            />
          </div>
          <div className="flex flex-col gap-2.5 pt-2">
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 rounded-xl bg-zinc-100 text-zinc-900 font-semibold hover:bg-zinc-200"
            >
              {isLoading ? "Loading..." : "Sign in"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isLoading}
              onClick={handleSignUp}
              className="w-full h-11 rounded-xl border-zinc-800/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
            >
              Create account
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
