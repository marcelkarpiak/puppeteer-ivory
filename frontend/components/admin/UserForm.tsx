'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { UserProfile } from '@/lib/admin-context'

interface UserFormProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    user: UserProfile | null
    onSuccess: () => void
}

export default function UserForm({
    open,
    onOpenChange,
    user,
    onSuccess
}: UserFormProps) {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [displayName, setDisplayName] = useState('')
    const [role, setRole] = useState<'admin' | 'user'>('user')
    const [saving, setSaving] = useState(false)

    const isEditing = !!user

    useEffect(() => {
        if (user) {
            setEmail(user.email || '')
            setDisplayName(user.display_name || '')
            setRole(user.role)
            setPassword('') // Don't show password for editing
        } else {
            setEmail('')
            setDisplayName('')
            setRole('user')
            setPassword('')
        }
    }, [user, open])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!isEditing && !email.trim()) {
            toast.error('Email jest wymagany')
            return
        }

        if (!isEditing && !password) {
            toast.error('Hasło jest wymagane')
            return
        }

        setSaving(true)
        try {
            const endpoint = '/api/admin/users'
            const method = isEditing ? 'PATCH' : 'POST'
            const body: any = {
                role,
                displayName: displayName.trim()
            }

            if (isEditing) {
                body.userId = user.id
                // Email and password are not updated here for now
            } else {
                body.email = email.trim()
                body.password = password
            }

            const res = await fetch(endpoint, {
                method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || 'Błąd podczas zapisywania użytkownika')
            }

            toast.success(isEditing ? 'Użytkownik zaktualizowany' : 'Użytkownik utworzony')
            onSuccess()
            onOpenChange(false)
        } catch (error: any) {
            console.error('Error saving user:', error)
            toast.error(error.message || 'Wystąpił błąd')
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
                            {isEditing ? 'Edytuj użytkownika' : 'Nowy użytkownik'}
                        </DialogTitle>
                        <DialogDescription>
                            {isEditing
                                ? 'Zmień rolę lub nazwę użytkownika'
                                : 'Utwórz nowego użytkownika z dostępem do panelu'}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="email@example.com"
                                disabled={isEditing} // Email editable false for now
                                required={!isEditing}
                            />
                        </div>

                        {!isEditing && (
                            <div className="space-y-2">
                                <Label htmlFor="password">Hasło</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Minimum 6 znaków"
                                    required={!isEditing}
                                    minLength={6}
                                />
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="display-name">Nazwa wyświetlana</Label>
                            <Input
                                id="display-name"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                placeholder="Jan Kowalski"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="role">Rola</Label>
                            <Select value={role} onValueChange={(val) => setRole(val as 'admin' | 'user')}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Wybierz rolę" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="user">Użytkownik</SelectItem>
                                    <SelectItem value="admin">Administrator</SelectItem>
                                </SelectContent>
                            </Select>
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
                                    Utwórz
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
