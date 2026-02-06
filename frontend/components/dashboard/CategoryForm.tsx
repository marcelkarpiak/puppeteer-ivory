'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
import { Category } from './CategoriesTable'

interface CategoryFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  category: Category | null
  onSuccess: () => void
  targetUserId?: string
}

const PRESET_COLORS = [
  '#3B82F6', // blue
  '#10B981', // green
  '#F59E0B', // amber
  '#8B5CF6', // violet
  '#EF4444', // red
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#F97316', // orange
  '#6B7280', // gray
  '#84CC16', // lime
]

export default function CategoryForm({
  open,
  onOpenChange,
  category,
  onSuccess,
  targetUserId
}: CategoryFormProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('#3B82F6')
  const [isDefault, setIsDefault] = useState(false)
  const [saving, setSaving] = useState(false)
  const { user } = useAuth()
  const supabase = createClient()

  const isEditing = !!category

  useEffect(() => {
    if (category) {
      setName(category.name)
      setColor(category.color)
      setIsDefault(category.is_default)
    } else {
      setName('')
      setColor('#3B82F6')
      setIsDefault(false)
    }
  }, [category, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      toast.error('Nazwa kategorii jest wymagana')
      return
    }

    if (!user) {
      toast.error('Musisz być zalogowany')
      return
    }

    setSaving(true)
    try {
      if (isEditing) {
        const { error } = await supabase
          .from('categories')
          .update({
            name: name.trim(),
            color,
            is_default: isDefault
          })
          .eq('id', category.id)

        if (error) throw error
        toast.success('Kategoria została zaktualizowana')
      } else {
        const { error } = await supabase
          .from('categories')
          .insert({
            user_id: targetUserId || user.id,
            name: name.trim(),
            color,
            is_default: isDefault
          })

        if (error) throw error
        toast.success('Kategoria została utworzona')
      }

      onSuccess()
      onOpenChange(false)
    } catch (error: unknown) {
      console.error('Error saving category:', error)
      const pgError = error as { code?: string; message?: string }
      if (pgError.code === '23505') {
        toast.error('Kategoria o tej nazwie już istnieje')
      } else {
        toast.error('Błąd podczas zapisywania kategorii')
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
              {isEditing ? 'Edytuj kategorię' : 'Nowa kategoria'}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? 'Zmień nazwę lub kolor kategorii'
                : 'Utwórz nową kategorię dla grup i słów kluczowych'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nazwa kategorii</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="np. Tłumaczenia, Praca, Wizy..."
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label>Kolor</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((presetColor) => (
                  <button
                    key={presetColor}
                    type="button"
                    onClick={() => setColor(presetColor)}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${color === presetColor
                      ? 'border-gray-900 dark:border-white scale-110 shadow-lg'
                      : 'border-transparent hover:scale-105'
                      }`}
                    style={{ backgroundColor: presetColor }}
                    title={presetColor}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Label htmlFor="custom-color" className="text-sm text-muted-foreground">
                  Własny kolor:
                </Label>
                <Input
                  id="custom-color"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-14 h-8 p-1 cursor-pointer"
                />
                <Input
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="#000000"
                  className="w-24 font-mono text-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Podgląd</Label>
              <div className="p-4 bg-muted rounded-lg flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full border-2 border-white shadow-sm"
                  style={{ backgroundColor: color }}
                />
                <span
                  className="px-3 py-1 rounded-full text-white font-medium text-sm"
                  style={{ backgroundColor: color }}
                >
                  {name || 'Nazwa kategorii'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="is-default">Kategoria domyślna</Label>
                <p className="text-sm text-muted-foreground">
                  Domyślne kategorie nie mogą być usunięte
                </p>
              </div>
              <Switch
                id="is-default"
                checked={isDefault}
                onCheckedChange={setIsDefault}
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
