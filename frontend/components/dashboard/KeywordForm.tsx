'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { RefreshCw, Save, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Keyword } from './KeywordsTable'
import { Category } from './CategoriesTable'

interface KeywordFormProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    keyword: Keyword | null
    categories: Category[]
    onSuccess: () => void
}

export default function KeywordForm({
    open,
    onOpenChange,
    keyword,
    categories,
    onSuccess
}: KeywordFormProps) {
    const [keywordText, setKeywordText] = useState('')
    const [categoryId, setCategoryId] = useState<string>('none')
    const [isActive, setIsActive] = useState(true)
    const [saving, setSaving] = useState(false)
    const { user } = useAuth()
    const supabase = createClient()

    const isEditing = !!keyword

    useEffect(() => {
        if (keyword) {
            setKeywordText(keyword.keyword)
            setCategoryId(keyword.category_id || 'none')
            setIsActive(keyword.is_active)
        } else {
            setKeywordText('')
            setCategoryId('none')
            setIsActive(true)
        }
    }, [keyword, open])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!keywordText.trim()) {
            toast.error('Słowo kluczowe jest wymagane')
            return
        }

        if (!user) {
            toast.error('Musisz być zalogowany')
            return
        }

        setSaving(true)
        try {
            const payload: {
                keyword: string;
                category_id: string | null;
                is_active: boolean;
                user_id?: string;
            } = {
                keyword: keywordText.trim(),
                category_id: categoryId === 'none' ? null : categoryId,
                is_active: isActive
            }

            if (isEditing) {
                const { error } = await supabase
                    .from('keywords')
                    .update(payload)
                    .eq('id', keyword.id)

                if (error) throw error
                toast.success('Słowo kluczowe zostało zaktualizowane')
            } else {
                payload.user_id = user.id
                const { error } = await supabase
                    .from('keywords')
                    .insert(payload)

                if (error) throw error
                toast.success('Słowo kluczowe zostało dodane')
            }

            onSuccess()
            onOpenChange(false)
        } catch (error: unknown) {
            console.error('Error saving keyword:', error)
            const pgError = error as { code?: string; message?: string }
            if (pgError.code === '23505') {
                toast.error('To słowo kluczowe już istnieje')
            } else {
                toast.error('Błąd podczas zapisywania słowa kluczowego')
            }
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>
                            {isEditing ? 'Edytuj słowo kluczowe' : 'Nowe słowo kluczowe'}
                        </DialogTitle>
                        <DialogDescription>
                            {isEditing
                                ? 'Zmień tekst słowa kluczowego lub przypisz do innej kategorii'
                                : 'Dodaj nowe słowo kluczowe, które bot będzie wyszukiwać w postach'}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="keyword">Słowo kluczowe</Label>
                            <Input
                                id="keyword"
                                value={keywordText}
                                onChange={(e) => setKeywordText(e.target.value)}
                                placeholder="np. praca, kierowca, hydraulik..."
                                autoFocus
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="category">Kategoria</Label>
                            <Select value={categoryId} onValueChange={setCategoryId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Wybierz kategorię" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Brak (nieskategoryzowana)</SelectItem>
                                    {categories.map((cat) => (
                                        <SelectItem key={cat.id} value={cat.id}>
                                            <div className="flex items-center gap-2">
                                                <div
                                                    className="w-3 h-3 rounded-full"
                                                    style={{ backgroundColor: cat.color }}
                                                />
                                                {cat.name}
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex items-center justify-between mt-4">
                            <div className="space-y-0.5">
                                <Label htmlFor="is-active">Aktywne</Label>
                                <p className="text-sm text-muted-foreground">
                                    Bot będzie ignorował nieaktywne słowa kluczowe
                                </p>
                            </div>
                            <Switch
                                id="is-active"
                                checked={isActive}
                                onCheckedChange={setIsActive}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={saving}
                        >
                            Anuluj
                        </Button>
                        <Button type="submit" disabled={saving}>
                            {saving ? (
                                <>
                                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                    Zapisywanie...
                                </>
                            ) : isEditing ? (
                                <>
                                    <Save className="w-4 h-4 mr-2" />
                                    Zapisz
                                </>
                            ) : (
                                <>
                                    <Plus className="w-4 h-4 mr-2" />
                                    Dodaj
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
