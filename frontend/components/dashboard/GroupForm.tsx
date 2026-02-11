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
import { Group } from './GroupsTable'
import { Category } from './CategoriesTable'

interface GroupFormProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    group: Group | null
    categories: Category[]
    onSuccess: () => void
    targetUserId?: string
}

const GROUP_REGEX = /^https?:\/\/(www\.)?facebook\.com\/groups\/[\w.-]+\/?$/

export default function GroupForm({
    open,
    onOpenChange,
    group,
    categories,
    onSuccess,
    targetUserId
}: GroupFormProps) {
    const [name, setName] = useState('')
    const [url, setUrl] = useState('')
    const [categoryId, setCategoryId] = useState<string>('none')
    const [isActive, setIsActive] = useState(true)
    const [saving, setSaving] = useState(false)
    const { user } = useAuth()
    const supabase = createClient()

    const isEditing = !!group

    useEffect(() => {
        if (group) {
            setName(group.name)
            setUrl(group.url)
            setCategoryId(group.category_id || 'none')
            setIsActive(group.is_active)
        } else {
            setName('')
            setUrl('')
            setCategoryId('none')
            setIsActive(true)
        }
    }, [group, open])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!name.trim()) {
            toast.error('Nazwa grupy jest wymagana')
            return
        }

        if (!url.trim()) {
            toast.error('Link do grupy jest wymagany')
            return
        }

        if (!GROUP_REGEX.test(url.trim())) {
            toast.error('Nieprawidłowy link do grupy (musi zawierać /groups/)')
            return
        }

        if (!user) {
            toast.error('Musisz być zalogowany')
            return
        }

        setSaving(true)
        try {
            const payload: {
                name: string;
                url: string;
                category_id: string | null;
                is_active: boolean;
                user_id?: string;
            } = {
                name: name.trim(),
                url: url.trim(),
                category_id: categoryId === 'none' ? null : categoryId,
                is_active: isActive
            }

            if (isEditing) {
                const { error } = await supabase
                    .from('groups')
                    .update(payload)
                    .eq('id', group.id)

                if (error) throw error
                toast.success('Grupa została zaktualizowana')
            } else {
                payload.user_id = targetUserId || user.id
                const { error } = await supabase
                    .from('groups')
                    .insert(payload)

                if (error) throw error
                toast.success('Grupa została dodana')
            }

            onSuccess()
            onOpenChange(false)
        } catch (error: unknown) {
            console.error('Error saving group:', error)
            const err = error as { message?: string }
            toast.error(err.message || 'Błąd podczas zapisywania grupy')
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
                            {isEditing ? 'Edytuj grupę' : 'Nowa grupa'}
                        </DialogTitle>
                        <DialogDescription>
                            {isEditing
                                ? 'Zmień dane grupy lub przypisz do innej kategorii'
                                : 'Dodaj nową grupę do monitorowania'}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Nazwa grupy</Label>
                            <Input
                                id="name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="np. Polacy w Berlinie"
                                autoFocus
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="url">Link do grupy</Label>
                            <Input
                                id="url"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                placeholder="https://facebook.com/groups/..."
                            />
                            <p className="text-xs text-muted-foreground">
                                Musi być pełnym linkiem do grupy (https://...)
                            </p>
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
                                <Label htmlFor="is-active">Aktywna</Label>
                                <p className="text-sm text-muted-foreground">
                                    Boty będą skanować tylko aktywne grupy
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
