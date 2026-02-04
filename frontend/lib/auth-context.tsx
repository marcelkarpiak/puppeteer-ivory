'use client'

import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { User, SupabaseClient } from '@supabase/supabase-js'
import { createClient } from './supabase-browser'
import { useRouter } from 'next/navigation'

type AuthContextType = {
    user: User | null
    profile: any | null
    isAdmin: boolean
    loading: boolean
    signOut: () => Promise<void>
    supabase: SupabaseClient
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [profile, setProfile] = useState<any | null>(null)
    const [loading, setLoading] = useState(true)
    const router = useRouter()
    const [supabase] = useState(() => createClient())

    // Use ref to track if profile is loaded to avoid stale closures in event listener
    const profileRef = useRef<any | null>(null)

    const fetchProfile = async (userId: string) => {
        console.log(`[AuthDebug] ${new Date().toISOString()} fetchProfile called for ${userId}`)
        try {
            const { data, error } = await supabase
                .from('user_profiles')
                .select('*')
                .eq('id', userId)
                .single()

            if (data) {
                console.log(`[AuthDebug] ${new Date().toISOString()} Profile fetched from DB:`, data)
                setProfile(data)
                profileRef.current = data
                localStorage.setItem('user_profile', JSON.stringify(data))
            } else if (error) {
                console.error(`[AuthDebug] ${new Date().toISOString()} Error fetching profile from DB:`, error)
                throw error
            }
        } catch (error) {
            console.error(`[AuthDebug] ${new Date().toISOString()} Catch error in fetchProfile:`, error)
            // Fallback to cache if network fails
            const cached = localStorage.getItem('user_profile')
            console.log(`[AuthDebug] ${new Date().toISOString()} Checking cache fallback. Cached exists:`, !!cached, 'ProfileRef:', !!profileRef.current)
            if (cached && !profileRef.current) {
                const parsed = JSON.parse(cached)
                console.log(`[AuthDebug] ${new Date().toISOString()} Restored profile from cache (fallback):`, parsed)
                setProfile(parsed)
                profileRef.current = parsed
            }
        }
    }

    useEffect(() => {
        const getUser = async () => {
            console.log(`[AuthDebug] ${new Date().toISOString()} getUser (initial load) started`)
            // Optimistic load from cache
            const cached = localStorage.getItem('user_profile')
            if (cached) {
                try {
                    console.log(`[AuthDebug] ${new Date().toISOString()} Found cached profile in localStorage`)
                    const parsed = JSON.parse(cached)
                    setProfile(parsed)
                    profileRef.current = parsed
                } catch (e) {
                    console.error(`[AuthDebug] ${new Date().toISOString()} Error parsing cached profile`, e)
                    localStorage.removeItem('user_profile')
                }
            }

            const { data: { session } } = await supabase.auth.getSession()
            console.log(`[AuthDebug] ${new Date().toISOString()} getSession result:`, session?.user?.id)
            setUser(session?.user ?? null)

            if (session?.user) {
                await fetchProfile(session.user.id)
            } else {
                console.log(`[AuthDebug] ${new Date().toISOString()} No session, clearing profile`)
                setProfile(null)
                profileRef.current = null
                localStorage.removeItem('user_profile')
            }
            setLoading(false)
        }

        getUser()

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                console.log(`[AuthDebug] ${new Date().toISOString()} onAuthStateChange event: ${event}`, session?.user?.id)

                if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
                    setUser(session?.user ?? null)

                    // Check ref instead of state to avoid stale closure
                    const needsProfile = session?.user && (!profileRef.current || event === 'SIGNED_IN');
                    console.log(`[AuthDebug] ${new Date().toISOString()} Handling ${event}. Needs profile fetch?`, needsProfile)

                    if (needsProfile && session?.user) {
                        await fetchProfile(session.user.id)
                    }

                    // Only refresh router on explicit SIGNED_IN to update server components
                    if (event === 'SIGNED_IN') {
                        console.log(`[AuthDebug] ${new Date().toISOString()} SIGNED_IN event. Skipping router.refresh() to prevent request hanging.`)
                        // router.refresh() 
                    }
                } else if (event === 'SIGNED_OUT') {
                    console.log(`[AuthDebug] ${new Date().toISOString()} Handling SIGNED_OUT`)
                    setUser(null)
                    setProfile(null)
                    profileRef.current = null
                    localStorage.removeItem('user_profile')
                    router.refresh()
                    router.push('/login')
                }
            }
        )

        return () => {
            console.log(`[AuthDebug] ${new Date().toISOString()} Unsubscribing from auth listener`)
            subscription.unsubscribe()
        }
    }, [router, supabase])

    const signOut = async () => {
        await supabase.auth.signOut()
        localStorage.removeItem('user_profile')
        router.push('/login')
    }

    return (
        <AuthContext.Provider value={{
            user,
            profile,
            isAdmin: profile?.role === 'admin',
            loading,
            signOut,
            supabase
        }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => {
    const context = useContext(AuthContext)
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider')
    }
    return context
}
