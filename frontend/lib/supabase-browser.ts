import { createBrowserClient } from '@supabase/ssr'

const customFetch = async (url: RequestInfo | URL, options?: RequestInit) => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 20000) // 20s global timeout

    // Chain the abort signal if one exists in options
    if (options?.signal) {
        options.signal.addEventListener('abort', () => controller.abort())
    }

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
        })
        return response
    } finally {
        clearTimeout(timeoutId)
    }
}

export const createClient = () =>
    createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            global: {
                fetch: customFetch,
            },
        }
    )
