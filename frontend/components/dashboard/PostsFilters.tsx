'use client'

import * as React from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { format } from 'date-fns'
import { pl } from 'date-fns/locale'
import { Calendar as CalendarIcon, Check, ChevronsUpDown, X, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList
} from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { DateRange } from 'react-day-picker'

interface PostsFiltersProps {
    groups: { id: string; name: string }[]
    categories: { id: string; name: string }[]
    keywords: { id: string; keyword: string }[]
    onExport?: () => void
}

const STATUSES = [
    { value: 'new', label: 'Nowy' },
    { value: 'done', label: 'Gotowy' },
    { value: 'processing', label: 'W trakcie' },
    { value: 'error', label: 'Błąd' },
    { value: 'processed', label: 'Opracowany' },
    { value: 'rejected', label: 'Odrzucony' },
]

const SORT_OPTIONS = [
    { value: 'scraped_at.desc', label: 'Od najnowszych' },
    { value: 'scraped_at.asc', label: 'Od najstarszych' },
    { value: 'author_name.asc', label: 'Autor A-Z' },
    { value: 'author_name.desc', label: 'Autor Z-A' },
]

export function PostsFilters({ groups, categories, keywords, onExport }: PostsFiltersProps) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    // State
    const [author, setAuthor] = React.useState(searchParams.get('author') || '')
    const [selectedStatuses, setSelectedStatuses] = React.useState<string[]>(
        searchParams.get('status')?.split(',') || []
    )
    const [dateRange, setDateRange] = React.useState<DateRange | undefined>(
        searchParams.get('from') && searchParams.get('to')
            ? {
                from: new Date(searchParams.get('from')!),
                to: new Date(searchParams.get('to')!),
            }
            : undefined
    )
    const [selectedGroup, setSelectedGroup] = React.useState(searchParams.get('groupId') || 'all')
    const [selectedCategory, setSelectedCategory] = React.useState(searchParams.get('categoryId') || 'all')

    // Keywords
    const [selectedKeyword, setSelectedKeyword] = React.useState(searchParams.get('keyword') || 'all')
    const [openKeyword, setOpenKeyword] = React.useState(false)

    // Sort
    const [selectedSort, setSelectedSort] = React.useState(searchParams.get('sort') || 'scraped_at.desc')

    const [openStatus, setOpenStatus] = React.useState(false)

    // Debounce author update
    React.useEffect(() => {
        const handler = setTimeout(() => {
            // Avoid triggering update if author hasn't changed from searchParams
            // But wait, if searchParams changes (e.g. from clearFilters), 'author' state might be out of sync if we don't sync it.
            // It's tricky to sync standard input with searchParams via props AND allow local typing.
            // Usually: 1. Init state from props/searchParams. 2. useEffect on searchParams change to re-init state?
            // But re-init on searchParams change conflicts with user typing if user typing -> updates URL -> updates props -> re-inits input.
            // This renders input "laggy" or cursor jumpy if not careful.
            // Best is: User types -> updates local state -> debounce -> updates URL.
            // URL update -> component re-renders. We should NOT reset local state on re-render unless the parameter changed EXTERNALLY (like clear buttons).
            // But here we rely on clearFilters triggering router push.
            // Let's use a key or just checking if `author` matches `searchParams.get('author')`.
            if (author !== (searchParams.get('author') || '')) {
                updateFilters({ author: author || null })
            }
        }, 500)
        return () => clearTimeout(handler)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [author])

    // Effect to sync state when URL changes (e.g. back button or clear filters)
    React.useEffect(() => {
        const urlAuthor = searchParams.get('author') || ''
        if (urlAuthor !== author && urlAuthor === '') {
            // Only sync if URL cleared it (simplification), or strict sync?
            // Strict sync could be annoying while typing.
            // Since we debounce update, by the time URL updates, it matches author.
            // So if they differ, it means URL changed from outside.
            // BUT when typing, author changes, URL is old until debounce fires.
            // So check if URL matches what we think it should be?
            // Let's just listen to specific "clear" actions or re-initialize on mount.
            // Actually, for Clear Filters to work, we need to react to searchParams being empty.
            setAuthor(urlAuthor)
        }

        setSelectedStatuses(searchParams.get('status')?.split(',') || [])
        setSelectedGroup(searchParams.get('groupId') || 'all')
        setSelectedCategory(searchParams.get('categoryId') || 'all')
        setSelectedKeyword(searchParams.get('keyword') || 'all')
        setSelectedSort(searchParams.get('sort') || 'scraped_at.desc')

        if (searchParams.get('from') && searchParams.get('to')) {
            setDateRange({
                from: new Date(searchParams.get('from')!),
                to: new Date(searchParams.get('to')!)
            })
            setDateRange(undefined)
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams])


    const updateFilters = (updates: Record<string, string | null>) => {
        const params = new URLSearchParams(searchParams.toString())

        Object.entries(updates).forEach(([key, value]) => {
            if (value === null || value === 'all') {
                params.delete(key)
            } else {
                params.set(key, value)
            }
        })

        router.push(`${pathname}?${params.toString()}`)
    }

    const handleStatusToggle = (value: string) => {
        const newStatuses = selectedStatuses.includes(value)
            ? selectedStatuses.filter((s) => s !== value)
            : [...selectedStatuses, value]

        // Optimistic update
        setSelectedStatuses(newStatuses)
        updateFilters({ status: newStatuses.length > 0 ? newStatuses.join(',') : null })
    }

    const handleDateSelect = (range: DateRange | undefined) => {
        // Optimistic update
        setDateRange(range)
        if (range?.from) {
            updateFilters({
                from: range.from.toISOString(),
                to: range.to ? range.to.toISOString() : range.from.toISOString()
            })
        } else {
            updateFilters({ from: null, to: null })
        }
    }

    const clearFilters = () => {
        // Just pushing empty params will trigger useEffect to reset state
        router.push(pathname)
    }

    return (
        <div className="flex flex-col gap-4 p-4 bg-white dark:bg-slate-950 rounded-lg border shadow-sm">
            <div className="flex flex-wrap gap-4 items-end">
                {/* Author Search */}
                <div className="flex flex-col gap-1.5 w-[200px]">
                    <span className="text-xs font-semibold text-muted-foreground">Autor</span>
                    <Input
                        placeholder="Szukaj autora..."
                        value={author}
                        onChange={(e) => setAuthor(e.target.value)}
                        className="h-9"
                    />
                </div>

                {/* Status Filter */}
                <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-muted-foreground">Status</span>
                    <Popover open={openStatus} onOpenChange={setOpenStatus}>
                        <PopoverTrigger asChild>
                            <Button variant="outline" role="combobox" aria-expanded={openStatus} className="h-9 w-[180px] justify-between">
                                {selectedStatuses.length === 0
                                    ? "Wszystkie statusy"
                                    : `${selectedStatuses.length} wybranych`}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[180px] p-0">
                            <Command>
                                <CommandList>
                                    <CommandGroup>
                                        {STATUSES.map((status) => (
                                            <CommandItem
                                                key={status.value}
                                                value={status.value}
                                                onSelect={() => handleStatusToggle(status.value)}
                                            >
                                                <div className={cn(
                                                    "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                                    selectedStatuses.includes(status.value)
                                                        ? "bg-primary text-primary-foreground"
                                                        : "opacity-50 [&_svg]:invisible"
                                                )}>
                                                    <Check className={cn("h-4 w-4")} />
                                                </div>
                                                {status.label}
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                </div>

                {/* Keyword Filter (Popover + Command) */}
                <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-muted-foreground">Słowo kluczowe</span>
                    <Popover open={openKeyword} onOpenChange={setOpenKeyword}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={openKeyword}
                                className="w-[200px] justify-between h-9"
                            >
                                {selectedKeyword === 'all'
                                    ? "Wszystkie słowa"
                                    : keywords.find((k) => k.keyword === selectedKeyword)?.keyword || selectedKeyword}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[200px] p-0">
                            <Command>
                                <CommandInput placeholder="Szukaj słowa..." />
                                <CommandList>
                                    <CommandEmpty>Brak wyników.</CommandEmpty>
                                    <CommandGroup>
                                        <CommandItem
                                            value="all"
                                            onSelect={() => {
                                                setSelectedKeyword('all')
                                                updateFilters({ keyword: 'all' })
                                                setOpenKeyword(false)
                                            }}
                                        >
                                            <Check
                                                className={cn(
                                                    "mr-2 h-4 w-4",
                                                    selectedKeyword === 'all' ? "opacity-100" : "opacity-0"
                                                )}
                                            />
                                            Wszystkie słowa
                                        </CommandItem>
                                        {keywords.map((k) => (
                                            <CommandItem
                                                key={k.id}
                                                value={k.keyword}
                                                onSelect={() => {
                                                    setSelectedKeyword(k.keyword)
                                                    updateFilters({ keyword: k.keyword })
                                                    setOpenKeyword(false)
                                                }}
                                            >
                                                <Check
                                                    className={cn(
                                                        "mr-2 h-4 w-4",
                                                        selectedKeyword === k.keyword ? "opacity-100" : "opacity-0"
                                                    )}
                                                />
                                                {k.keyword}
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                </div>

                {/* Group Filter */}
                <div className="flex flex-col gap-1.5 w-[180px]">
                    <span className="text-xs font-semibold text-muted-foreground">Grupa</span>
                    <Select
                        value={selectedGroup}
                        onValueChange={(val) => {
                            setSelectedGroup(val)
                            updateFilters({ groupId: val })
                        }}
                    >
                        <SelectTrigger className="h-9">
                            <SelectValue placeholder="Wszystkie grupy" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Wszystkie grupy</SelectItem>
                            {groups.map((g) => (
                                <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Category Filter */}
                <div className="flex flex-col gap-1.5 w-[180px]">
                    <span className="text-xs font-semibold text-muted-foreground">Kategoria</span>
                    <Select
                        value={selectedCategory}
                        onValueChange={(val) => {
                            setSelectedCategory(val)
                            updateFilters({ categoryId: val })
                        }}
                    >
                        <SelectTrigger className="h-9">
                            <SelectValue placeholder="Wszystkie kategorie" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Wszystkie kategorie</SelectItem>
                            {categories.map((c) => (
                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Date Range Filter */}
                <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-muted-foreground">Zakres dat</span>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant={"outline"}
                                className={cn(
                                    "h-9 justify-start text-left font-normal w-[240px]",
                                    !dateRange && "text-muted-foreground"
                                )}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {dateRange?.from ? (
                                    dateRange.to ? (
                                        <>
                                            {format(dateRange.from, "LLL dd, y", { locale: pl })} -{" "}
                                            {format(dateRange.to, "LLL dd, y", { locale: pl })}
                                        </>
                                    ) : (
                                        format(dateRange.from, "LLL dd, y", { locale: pl })
                                    )
                                ) : (
                                    <span>Wybierz daty</span>
                                )}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                                initialFocus
                                mode="range"
                                defaultMonth={dateRange?.from}
                                selected={dateRange}
                                onSelect={handleDateSelect}
                                numberOfMonths={2}
                                locale={pl}
                            />
                        </PopoverContent>
                    </Popover>
                </div>

                {/* Sort Filter */}
                <div className="flex flex-col gap-1.5 w-[180px]">
                    <span className="text-xs font-semibold text-muted-foreground">Sortowanie</span>
                    <Select
                        value={selectedSort}
                        onValueChange={(val) => {
                            setSelectedSort(val)
                            updateFilters({ sort: val })
                        }}
                    >
                        <SelectTrigger className="h-9">
                            <SelectValue placeholder="Sortowanie" />
                        </SelectTrigger>
                        <SelectContent>
                            {SORT_OPTIONS.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Action Buttons */}
                <div className="flex items-end pb-0.5 ml-auto gap-2">
                    {onExport && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onExport}
                            className="h-8 gap-2"
                        >
                            <Download className="h-4 w-4" />
                            Eksportuj CSV
                        </Button>
                    )}

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearFilters}
                        className="text-muted-foreground hover:text-foreground h-8"
                    >
                        <X className="mr-2 h-4 w-4" />
                        Wyczyść filtry
                    </Button>
                </div>
            </div>

            {/* Active Filters Summary */}
            {(selectedStatuses.length > 0 || selectedGroup !== 'all' || selectedCategory !== 'all' || selectedKeyword !== 'all' || dateRange || author) && (
                <div className="flex flex-wrap gap-2 pt-2 border-t mt-2">
                    {selectedStatuses.map(status => (
                        <Badge key={status} variant="secondary" className="gap-1">
                            Status: {STATUSES.find(s => s.value === status)?.label}
                            <X className="h-3 w-3 cursor-pointer" onClick={() => handleStatusToggle(status)} />
                        </Badge>
                    ))}
                    {selectedGroup !== 'all' && (
                        <Badge variant="secondary" className="gap-1">
                            Grupa: {groups.find(g => g.id === selectedGroup)?.name || selectedGroup}
                            <X className="h-3 w-3 cursor-pointer" onClick={() => {
                                setSelectedGroup('all')
                                updateFilters({ groupId: 'all' })
                            }} />
                        </Badge>
                    )}
                    {selectedCategory !== 'all' && (
                        <Badge variant="secondary" className="gap-1">
                            Kategoria: {categories.find(c => c.id === selectedCategory)?.name || selectedCategory}
                            <X className="h-3 w-3 cursor-pointer" onClick={() => {
                                setSelectedCategory('all')
                                updateFilters({ categoryId: 'all' })
                            }} />
                        </Badge>
                    )}
                    {selectedKeyword !== 'all' && (
                        <Badge variant="secondary" className="gap-1">
                            Słowo: {keywords.find(k => k.keyword === selectedKeyword)?.keyword || selectedKeyword}
                            <X className="h-3 w-3 cursor-pointer" onClick={() => {
                                setSelectedKeyword('all')
                                updateFilters({ keyword: 'all' })
                            }} />
                        </Badge>
                    )}
                    {dateRange?.from && (
                        <Badge variant="secondary" className="gap-1">
                            Data: {format(dateRange.from, "dd.MM")} - {dateRange.to ? format(dateRange.to, "dd.MM") : '...'}
                            <X className="h-3 w-3 cursor-pointer" onClick={() => {
                                setDateRange(undefined)
                                updateFilters({ from: null, to: null })
                            }} />
                        </Badge>
                    )}
                    {author && (
                        <Badge variant="secondary" className="gap-1">
                            Autor: {author}
                            <X className="h-3 w-3 cursor-pointer" onClick={() => {
                                setAuthor('')
                                // updateFilters is handled by effect when author changes, but here we force clear
                                // Effectively setAuthor('') -> effect fires -> updates URL.
                            }} />
                        </Badge>
                    )}
                </div>
            )}
        </div>
    )
}
