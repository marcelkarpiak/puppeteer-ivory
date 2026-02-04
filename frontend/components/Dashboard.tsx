'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { type Post } from '@/lib/supabase'
import { CardContent, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import {
  Activity,
  Camera,
  LayoutList
} from 'lucide-react'
import PostsTable from './dashboard/PostsTable'
import BotControl from './dashboard/BotControl'
import StatsCards from './dashboard/StatsCards'
import { PostsFilters } from './dashboard/PostsFilters'

export default function Dashboard() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    total: 0,
    done: 0,
    processing: 0,
    error: 0,
    processed: 0,
    today: 0,
    successRate: 0,
    topGroups: [] as { name: string, count: number }[]
  })
  const { supabase } = useAuth()
  const searchParams = useSearchParams()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [categories, setCategories] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [groups, setGroups] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [keywords, setKeywords] = useState<any[]>([])

  const fetchPosts = useCallback(async () => {
    if (!supabase) return

    setLoading(true)
    try {
      // Build query based on search params
      let query = supabase
        .from('posts')
        .select('*')

      // Filters
      const statusParam = searchParams.get('status')
      if (statusParam) {
        query = query.in('status', statusParam.split(','))
      }

      const groupId = searchParams.get('groupId')
      if (groupId && groupId !== 'all') {
        query = query.eq('group_id', groupId)
      }

      const categoryId = searchParams.get('categoryId')
      if (categoryId && categoryId !== 'all') {
        query = query.eq('category_id', categoryId)
      }

      const keywordParam = searchParams.get('keyword')
      if (keywordParam && keywordParam !== 'all') {
        // Keyword match logic involves 'matched_keywords' array column?
        // Or simple text search if keywords are just strings?
        // The table structure: posts has 'matched_keywords' (text[] possibly?)
        // If it is text[], we use .contains('matched_keywords', [keyword])
        query = query.contains('matched_keywords', [keywordParam])
      }

      const author = searchParams.get('author')
      if (author) {
        query = query.ilike('author_name', `%${author}%`)
      }

      const fromDate = searchParams.get('from')
      if (fromDate) {
        query = query.gte('scraped_at', fromDate)
      }

      const toDate = searchParams.get('to')
      if (toDate) {
        query = query.lte('scraped_at', toDate)
      }

      // Sorting
      const sortParam = searchParams.get('sort') || 'scraped_at.desc'
      const [sortField, sortOrder] = sortParam.split('.')
      query = query.order(sortField, { ascending: sortOrder === 'asc' }).limit(100)

      const { data: postsData, error: postsError } = await query

      if (postsError) throw postsError

      // Fetch metadata
      const [categoriesRes, groupsRes, keywordsRes] = await Promise.all([
        supabase.from('categories').select('*'),
        supabase.from('groups').select('id, name'),
        supabase.from('keywords').select('*')
      ])

      if (categoriesRes.error) console.error('Error fetching categories:', categoriesRes.error)
      if (groupsRes.error) console.error('Error fetching groups:', groupsRes.error)
      if (keywordsRes.error) console.error('Error fetching keywords:', keywordsRes.error)

      setPosts(postsData || [])
      setCategories(categoriesRes.data || [])
      setGroups(groupsRes.data || [])
      setKeywords(keywordsRes.data || [])

      // ------------------------------------------------------------------
      // GLOBAL STATS FETCHING (Phase 2.3)
      // ------------------------------------------------------------------

      // 1. Fetch counts by status
      // Note: This matches "select count(*) from posts group by status"
      // Supabase basic client doesn't support GROUP BY easily.
      // We will perform individual count queries for simplicity and correctness.

      const statusCounts = {
        total: 0,
        done: 0,
        processing: 0,
        error: 0,
        processed: 0,
        today: 0
      }

      // Parallelize count requests
      const [totalRes, doneRes, processingRes, errorRes, processedRes, todayRes] = await Promise.all([
        supabase.from('posts').select('*', { count: 'exact', head: true }),
        supabase.from('posts').select('*', { count: 'exact', head: true }).eq('status', 'done'),
        supabase.from('posts').select('*', { count: 'exact', head: true }).eq('status', 'processing'),
        supabase.from('posts').select('*', { count: 'exact', head: true }).eq('status', 'error'),
        supabase.from('posts').select('*', { count: 'exact', head: true }).eq('status', 'processed'),
        supabase.from('posts').select('*', { count: 'exact', head: true }).gte('scraped_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
      ])

      statusCounts.total = totalRes.count || 0
      statusCounts.done = doneRes.count || 0
      statusCounts.processing = processingRes.count || 0
      statusCounts.error = errorRes.count || 0
      statusCounts.processed = processedRes.count || 0
      statusCounts.today = todayRes.count || 0

      // Success Rate: (Done + Processed) / Total * 100
      const meaningfulTotal = statusCounts.total - statusCounts.processing - (statusCounts.total === 0 ? 0 : 0) // Avoid div by zero
      // Simplified: Just based on total for now
      const successRate = statusCounts.total > 0
        ? Math.round(((statusCounts.done + statusCounts.processed) / statusCounts.total) * 100)
        : 0

      // Top Groups (Today)
      // Since we can't easily GROUP BY, we'll fetch today's posts (we already did head=true, now we need data for aggregation)
      // But we shouldn't fetch potentially thousands of rows just for this.
      // Optimization: Fetch only group_id for today's posts.
      const { data: todayPostsIds } = await supabase
        .from('posts')
        .select('group_id')
        .gte('scraped_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())

      const groupCounts: Record<string, number> = {}
      todayPostsIds?.forEach((p: any) => {
        if (p.group_id) {
          groupCounts[p.group_id] = (groupCounts[p.group_id] || 0) + 1
        }
      })

      const topGroups = Object.entries(groupCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([groupId, count]) => {
          const groupName = groupsRes.data?.find((g: any) => g.id === groupId)?.name || 'Nieznana grupa'
          return { name: groupName, count }
        })

      setStats({
        ...statusCounts,
        successRate,
        topGroups
      })

    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase, searchParams])

  const handleExport = async () => {
    if (!supabase) return

    try {
      // Re-fetch ALL filtered data (not just page limit) for export
      let query = supabase.from('posts').select('*')

      // Apply same filters as main query
      const statusParam = searchParams.get('status')
      if (statusParam) query = query.in('status', statusParam.split(','))

      const groupId = searchParams.get('groupId')
      if (groupId && groupId !== 'all') query = query.eq('group_id', groupId)

      const categoryId = searchParams.get('categoryId')
      if (categoryId && categoryId !== 'all') query = query.eq('category_id', categoryId)

      const keywordParam = searchParams.get('keyword')
      if (keywordParam && keywordParam !== 'all') query = query.contains('matched_keywords', [keywordParam])

      const author = searchParams.get('author')
      if (author) query = query.ilike('author_name', `%${author}%`)

      const fromDate = searchParams.get('from')
      if (fromDate) query = query.gte('scraped_at', fromDate)

      const toDate = searchParams.get('to')
      if (toDate) query = query.lte('scraped_at', toDate)

      const { data, error } = await query

      if (error) throw error
      if (!data || data.length === 0) {
        alert('Brak danych do eksportu')
        return
      }

      // Generate CSV
      const headers = ['ID', 'Autor', 'Treść', 'URL posta', 'Status', 'Data pobrania', 'Grupa ID', 'Kategoria']
      const csvContent = [
        headers.join(','),
        ...data.map(p => [
          p.external_id,
          `"${p.author_name?.replace(/"/g, '""')}"`,
          `"${p.content?.replace(/"/g, '""')?.substring(0, 100)}..."`, // Truncate content for CSV safety/readability
          p.post_url,
          p.status,
          p.scraped_at,
          p.group_id,
          p.category
        ].join(','))
      ].join('\n')

      // Download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `fb_scraper_export_${new Date().toISOString().slice(0, 10)}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

    } catch (err) {
      console.error('Export error:', err)
      alert('Błąd podczas eksportu danych')
    }
  }

  useEffect(() => {
    fetchPosts()

    if (!supabase) return

    const channel = supabase
      .channel('posts-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'posts' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          console.log('Realtime update:', payload)
          fetchPosts()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, fetchPosts])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
              Facebook Scraper Dashboard
            </h1>
            <p className="text-muted-foreground mt-2">
              Zarządzaj postami z grup Facebook - automatyczne skanowanie i screenshoty
            </p>
          </div>
          <Badge variant="outline" className="text-lg px-4 py-2">
            <Activity className="w-4 h-4 mr-2 animate-pulse" />
            Live
          </Badge>
        </div>

        <StatsCards stats={stats} />

        <Tabs defaultValue="posts" className="space-y-4">
          <TabsList>
            <TabsTrigger value="posts">
              <LayoutList className="w-4 h-4 mr-2" />
              Posty
            </TabsTrigger>
            <TabsTrigger value="bots">
              <Camera className="w-4 h-4 mr-2" />
              Boty
            </TabsTrigger>
          </TabsList>

          <TabsContent value="posts" className="space-y-4">
            <PostsFilters
              groups={groups}
              categories={categories}
              keywords={keywords}
              onExport={handleExport}
            />

            <PostsTable
              posts={posts}
              categories={categories}
              loading={loading}
              onRefresh={fetchPosts}
            />
          </TabsContent>

          <TabsContent value="bots" className="space-y-4">
            <BotControl />
          </TabsContent>
        </Tabs>
      </div>
    </div >
  )
}
