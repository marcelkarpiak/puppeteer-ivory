'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    Pencil,
    Trash2,
    RefreshCw,
    ExternalLink,
    Users
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { pl } from 'date-fns/locale'
import { toast } from 'sonner'
import { Category } from './CategoriesTable'

export interface Group {
    id: string
    user_id: string
    name: string
    url: string
    category_id?: string
    is_active: boolean
    stats?: {
        posts_found?: number
        last_scraped?: string
    }
    created_at: string
}

interface GroupsTableProps {
    groups: Group[]
    categories: Category[]
    loading: boolean
    onRefresh: () => void
    onEdit: (group: Group) => void
    readOnly?: boolean
}

export default function GroupsTable({
    groups,
    categories,
    loading,
    onRefresh,
    onEdit,
    readOnly = false
}: GroupsTableProps) {
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
    const [groupToDelete, setGroupToDelete] = useState<Group | null>(null)
    const [deleting, setDeleting] = useState(false)
    const [toggling, setToggling] = useState<string | null>(null)
    const supabase = createClient()

    const handleDeleteClick = (group: Group) => {
        setGroupToDelete(group)
        setDeleteDialogOpen(true)
    }

    const handleDeleteConfirm = async () => {
        if (!groupToDelete) return

        setDeleting(true)
        try {
            const { error } = await supabase
                .from('groups')
                .delete()
                .eq('id', groupToDelete.id)

            if (error) throw error

            toast.success('Grupa została usunięta')
            onRefresh()
        } catch (error) {
            console.error('Error deleting group:', error)
            toast.error('Błąd podczas usuwania grupy')
        } finally {
            setDeleting(false)
            setDeleteDialogOpen(false)
            setGroupToDelete(null)
        }
    }

    const handleToggleActive = async (group: Group) => {
        setToggling(group.id)
        try {
            const { error } = await supabase
                .from('groups')
                .update({ is_active: !group.is_active })
                .eq('id', group.id)

            if (error) throw error

            toast.success(`Grupa ${group.is_active ? 'wyłączona' : 'włączona'}`)
            onRefresh()
        } catch (error) {
            console.error('Error toggling group:', error)
            toast.error('Błąd zmiany statusu grupy')
        } finally {
            setToggling(null)
        }
    }

    const getCategoryName = (categoryId?: string) => {
        if (!categoryId) return <span className="text-muted-foreground italic">Brak</span>
        const category = categories.find(c => c.id === categoryId)
        return category ? (
            <Badge variant="secondary" style={{ backgroundColor: category.color, color: '#fff' }}>
                {category.name}
            </Badge>
        ) : (
            <span className="text-muted-foreground">Nieznana</span>
        )
    }

    if (loading) {
        return (
            <Card>
                <CardContent className="flex items-center justify-center h-64">
                    <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
                </CardContent>
            </Card>
        )
    }

    if (groups.length === 0) {
        return (
            <Card>
                <CardContent className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                    <Users className="w-12 h-12 mb-4" />
                    <p className="text-lg font-medium">Brak grup</p>
                    <p className="text-sm">Dodaj pierwszą grupę Facebook, aby rozpocząć monitorowanie</p>
                </CardContent>
            </Card>
        )
    }

    return (
        <>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Lista grup ({groups.length})</CardTitle>
                    <Button onClick={onRefresh} variant="outline" size="sm">
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Odśwież
                    </Button>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Nazwa</TableHead>
                                    <TableHead>Link</TableHead>
                                    <TableHead>Kategoria</TableHead>
                                    <TableHead>Posty</TableHead>
                                    <TableHead>Posty</TableHead>
                                    <TableHead>Utworzona</TableHead>
                                    {!readOnly && <TableHead className="text-right">Akcje</TableHead>}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {groups.map((group) => (
                                    <TableRow key={group.id}>
                                        <TableCell>
                                            {readOnly ? (
                                                <Badge variant={group.is_active ? "default" : "secondary"} className={group.is_active ? "bg-green-500 hover:bg-green-600" : ""}>
                                                    {group.is_active ? "Aktywna" : "Nieaktywna"}
                                                </Badge>
                                            ) : (
                                                <Switch
                                                    checked={group.is_active}
                                                    onCheckedChange={() => handleToggleActive(group)}
                                                    disabled={toggling === group.id}
                                                    className={group.is_active ? "bg-green-500" : ""}
                                                />
                                            )}
                                        </TableCell>
                                        <TableCell className="font-medium">
                                            {group.name}
                                        </TableCell>
                                        <TableCell>
                                            <a
                                                href={group.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center text-blue-600 hover:underline"
                                            >
                                                FB <ExternalLink className="w-3 h-3 ml-1" />
                                            </a>
                                        </TableCell>
                                        <TableCell>
                                            {getCategoryName(group.category_id)}
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-sm text-muted-foreground">
                                                {group.stats?.posts_found || 0}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-xs text-muted-foreground">
                                                {formatDistanceToNow(new Date(group.created_at), {
                                                    addSuffix: true,
                                                    locale: pl
                                                })}
                                            </span>
                                        </TableCell>
                                        {!readOnly && (
                                            <TableCell className="text-right">
                                                <div className="flex gap-2 justify-end">
                                                    <Button
                                                        onClick={() => onEdit(group)}
                                                        variant="ghost"
                                                        size="sm"
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        onClick={() => handleDeleteClick(group)}
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        )}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card >

            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Potwierdź usunięcie</DialogTitle>
                        <DialogDescription>
                            Czy na pewno chcesz usunąć grupę <strong>{groupToDelete?.name}</strong>?
                            Ta operacja jest nieodwracalna.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDeleteDialogOpen(false)}
                            disabled={deleting}
                        >
                            Anuluj
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDeleteConfirm}
                            disabled={deleting}
                        >
                            {deleting ? (
                                <>
                                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                    Usuwanie...
                                </>
                            ) : (
                                <>
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Usuń
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
