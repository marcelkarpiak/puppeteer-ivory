import { createClient } from '@/lib/supabase-server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Lazy-initialized admin client — avoids crash at module load if env var is missing
let _supabaseAdmin: ReturnType<typeof createSupabaseClient> | null = null

function getSupabaseAdmin() {
    if (!_supabaseAdmin) {
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!serviceKey) {
            throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
        }
        _supabaseAdmin = createSupabaseClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            serviceKey,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            }
        )
    }
    return _supabaseAdmin
}

/**
 * Middleware helper to verify admin access
 */
async function verifyAdmin() {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
        return { error: 'Unauthorized', status: 401 }
    }

    const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (profileError || profile?.role !== 'admin') {
        return { error: 'Forbidden', status: 403 }
    }

    return { user }
}

export async function GET(request: Request) {
    console.log('[API] GET /api/admin/users called')

    // Check key availability
    const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY
    console.log('[API] Has Service Key:', hasServiceKey)

    const auth = await verifyAdmin()
    if (auth.error) {
        console.error('[API] Admin verification failed:', auth.error, auth.status)
        return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    // List all users from auth.users (requires service role)
    // Supabase Auth API listUsers()
    console.log('[API] Calling getSupabaseAdmin().auth.admin.listUsers()...')
    const { data: { users }, error } = await getSupabaseAdmin().auth.admin.listUsers()

    if (error) {
        console.error('[API] listUsers failed:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
    console.log(`[API] listUsers success. Found ${users.length} users.`)

    // Also get profiles to attach roles
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profiles } = await (getSupabaseAdmin() as any)
        .from('user_profiles')
        .select('*')

    // Merge auth data with profile data
    const mergedUsers = users.map(u => {
        const profile = profiles?.find((p: any) => p.id === u.id)
        return {
            id: u.id,
            email: u.email,
            created_at: u.created_at,
            last_sign_in_at: u.last_sign_in_at,
            display_name: profile?.display_name,
            role: profile?.role || 'user'
        }
    })

    return NextResponse.json(mergedUsers)
}

export async function POST(request: Request) {
    const auth = await verifyAdmin()
    if (auth.error) {
        return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    try {
        const body = await request.json()
        const { email, password, displayName, role } = body

        if (!email || !password) {
            return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
        }

        if (password.length < 6) {
            return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
        }

        // Create user in Auth
        const { data: createData, error: createError } = await getSupabaseAdmin().auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { display_name: displayName }
        })

        if (createError) {
            console.error('[API] createUser error:', createError.message, createError)
            throw createError
        }

        const user = createData.user
        if (!user) throw new Error('User creation failed — no user returned')

        // Upsert profile: trigger may or may not have created it
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: profileError } = await (getSupabaseAdmin() as any)
            .from('user_profiles')
            .upsert({
                id: user.id,
                email: user.email!,
                role: role || 'user',
                display_name: displayName || email.split('@')[0]
            }, { onConflict: 'id' })

        if (profileError) {
            console.error('[API] profile upsert error:', profileError.message)
            return NextResponse.json({ error: 'User created but profile setup failed: ' + profileError.message }, { status: 500 })
        }

        return NextResponse.json({ success: true, user })
    } catch (err: any) {
        console.error('[API] POST /api/admin/users error:', err.message, err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

export async function PATCH(request: Request) {
    const auth = await verifyAdmin()
    if (auth.error) {
        return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    try {
        const body = await request.json()
        const { userId, role, displayName } = body

        if (!userId) {
            return NextResponse.json({ error: 'UserId is required' }, { status: 400 })
        }

        // Prevent admin demotion of themselves (optional extra safety)
        // auth.user is the requester
        if (auth.user && userId === auth.user.id && role && role !== 'admin') {
            return NextResponse.json({ error: 'You cannot demote yourself' }, { status: 400 })
        }

        const updateData: any = {}
        if (role) updateData.role = role
        if (displayName !== undefined) updateData.display_name = displayName

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (getSupabaseAdmin() as any)
            .from('user_profiles')
            .update(updateData)
            .eq('id', userId)

        if (error) throw error

        return NextResponse.json({ success: true })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

export async function DELETE(request: Request) {
    const auth = await verifyAdmin()
    if (auth.error) {
        return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    try {
        const body = await request.json()
        const { userId } = body

        if (!userId) {
            return NextResponse.json({ error: 'UserId is required' }, { status: 400 })
        }

        // Prevent self-deletion
        if (auth.user && userId === auth.user.id) {
            return NextResponse.json({ error: 'You cannot delete yourself' }, { status: 400 })
        }

        const { error } = await getSupabaseAdmin().auth.admin.deleteUser(userId)

        if (error) throw error

        return NextResponse.json({ success: true })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
