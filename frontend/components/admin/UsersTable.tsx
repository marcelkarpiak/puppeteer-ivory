'use client'

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MoreHorizontal, Pencil, Trash, UserCog } from 'lucide-react'
import { UserProfile } from '@/lib/admin-context'
import { format } from 'date-fns'
import { pl } from 'date-fns/locale'

interface UsersTableProps {
    users: UserProfile[]
    loading: boolean
    onRefresh: () => void
    onEdit: (user: UserProfile) => void
    onDelete: (user: UserProfile) => void
    currentUserEmail?: string
}

export default function UsersTable({
    users,
    loading,
    onRefresh,
    onEdit,
    onDelete,
    currentUserEmail
}: UsersTableProps) {
    if (loading) {
        return <div className="text-center py-10">Ładowanie użytkowników...</div>
    }

    if (users.length === 0) {
        return <div className="text-center py-10 text-muted-foreground">Brak użytkowników.</div>
    }

    return (
        <div className="rounded-md border bg-white dark:bg-slate-950 shadow-sm">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Nazwa</TableHead>
                        <TableHead>Rola</TableHead>
                        <TableHead>Data utworzenia</TableHead>
                        <TableHead className="text-right">Akcje</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {users.map((user) => (
                        <TableRow key={user.id}>
                            <TableCell className="font-medium">{user.email}</TableCell>
                            <TableCell>{user.display_name || '-'}</TableCell>
                            <TableCell>
                                <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                                    {user.role}
                                </Badge>
                            </TableCell>
                            <TableCell>
                                {user.created_at ? format(new Date(user.created_at), 'd MMM yyyy, HH:mm', { locale: pl }) : '-'}
                            </TableCell>
                            <TableCell className="text-right">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" className="h-8 w-8 p-0">
                                            <span className="sr-only">Otwórz menu</span>
                                            <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuLabel>Akcje</DropdownMenuLabel>
                                        <DropdownMenuItem onClick={() => onEdit(user)}>
                                            <Pencil className="mr-2 h-4 w-4" />
                                            Edytuj
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                            onClick={() => onDelete(user)}
                                            className="text-red-600 focus:text-red-600"
                                            disabled={user.email === currentUserEmail}
                                        >
                                            <Trash className="mr-2 h-4 w-4" />
                                            Usuń
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    )
}
