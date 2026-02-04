'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { Alert, AlertDescription } from '@/components/ui/alert'
import { RefreshCw, Upload, Info, CheckCircle2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Category } from './CategoriesTable'

interface KeywordsBulkImportProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    categories: Category[]
    onSuccess: () => void
}

interface ImportResult {
    added: string[]
    duplicates: string[]
    errors: string[]
}

export default function KeywordsBulkImport({
    open,
    onOpenChange,
    categories,
    onSuccess
}: KeywordsBulkImportProps) {
    const [text, setText] = useState('')
    const [categoryId, setCategoryId] = useState<string>('none')
    const [importing, setImporting] = useState(false)
    const [result, setResult] = useState<ImportResult | null>(null)
    const { user } = useAuth()
    const supabase = createClient()

    const resetForm = () => {
        setText('')
        setCategoryId('none')
        setResult(null)
    }

    const handleOpenChange = (open: boolean) => {
        if (!open) {
            resetForm()
        }
        onOpenChange(open)
    }

    const parseKeywords = (input: string): string[] => {
        return input
            .split('\n')
            .map(line => line.trim().toLowerCase())
            .filter(line => line.length > 0)
            .filter((value, index, self) => self.indexOf(value) === index) // usuń duplikaty w tekście
    }

    const handleImport = async () => {
        if (!user) {
            toast.error('Musisz być zalogowany')
            return
        }

        const keywords = parseKeywords(text)

        if (keywords.length === 0) {
            toast.error('Wpisz przynajmniej jedno słowo kluczowe')
            return
        }

        setImporting(true)
        setResult(null)

        const importResult: ImportResult = {
            added: [],
            duplicates: [],
            errors: []
        }

        try {
            // Pobierz istniejące słowa kluczowe użytkownika
            const { data: existingKeywords } = await supabase
                .from('keywords')
                .select('keyword')
                .eq('user_id', user.id)

            const existingSet = new Set(
                existingKeywords?.map(k => k.keyword.toLowerCase()) || []
            )

            // Przefiltruj nowe słowa
            const newKeywords = keywords.filter(k => !existingSet.has(k))
            const duplicateKeywords = keywords.filter(k => existingSet.has(k))

            importResult.duplicates = duplicateKeywords

            if (newKeywords.length > 0) {
                // Przygotuj dane do insertu
                const insertData = newKeywords.map(keyword => ({
                    user_id: user.id,
                    keyword,
                    category_id: categoryId === 'none' ? null : categoryId,
                    is_active: true,
                    match_count: 0
                }))

                const { error } = await supabase
                    .from('keywords')
                    .insert(insertData)
                    .select()

                if (error) {
                    throw error
                }

                importResult.added = newKeywords
            }

            setResult(importResult)

            if (importResult.added.length > 0) {
                toast.success(`Dodano ${importResult.added.length} słów kluczowych`)
                onSuccess()
            } else if (importResult.duplicates.length > 0) {
                toast.warning('Wszystkie słowa już istnieją w bazie')
            }

        } catch (error: unknown) {
            console.error('Error importing keywords:', error)
            toast.error('Błąd podczas importu słów kluczowych')
            const err = error as { message?: string }
            importResult.errors.push(err.message || 'Nieznany błąd')
            setResult(importResult)
        } finally {
            setImporting(false)
        }
    }

    const previewCount = parseKeywords(text).length

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Masowy import słów kluczowych</DialogTitle>
                    <DialogDescription>
                        Dodaj wiele słów kluczowych jednocześnie
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Instrukcja */}
                    <Alert>
                        <Info className="h-4 w-4" />
                        <AlertDescription className="text-sm">
                            <strong>Jak dodawać słowa kluczowe:</strong>
                            <ul className="mt-2 ml-4 list-disc space-y-1">
                                <li>Wpisz każde słowo kluczowe w <strong>osobnej linii</strong></li>
                                <li>Możesz wpisywać pojedyncze słowa lub całe frazy</li>
                                <li>Wielkość liter nie ma znaczenia (wszystko zostanie zapisane małymi literami)</li>
                                <li>Duplikaty zostaną automatycznie pominięte</li>
                            </ul>
                        </AlertDescription>
                    </Alert>

                    {/* Textarea */}
                    <div className="space-y-2">
                        <Label htmlFor="keywords-text">
                            Słowa kluczowe ({previewCount} {previewCount === 1 ? 'słowo' : previewCount < 5 ? 'słowa' : 'słów'})
                        </Label>
                        <Textarea
                            id="keywords-text"
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            placeholder={`praca kierowca\ntłumacz przysięgły\nkarta pobytu\nvisa\nlegalizacja`}
                            rows={8}
                            className="font-mono text-sm"
                        />
                    </div>

                    {/* Kategoria */}
                    <div className="space-y-2">
                        <Label htmlFor="category">Przypisz do kategorii (opcjonalnie)</Label>
                        <Select value={categoryId} onValueChange={setCategoryId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Wybierz kategorię" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Brak kategorii</SelectItem>
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
                        <p className="text-xs text-muted-foreground">
                            Wszystkie importowane słowa zostaną przypisane do wybranej kategorii
                        </p>
                    </div>

                    {/* Wyniki importu */}
                    {result && (
                        <div className="space-y-2 p-3 bg-muted rounded-lg">
                            <p className="font-medium text-sm">Wyniki importu:</p>

                            {result.added.length > 0 && (
                                <div className="flex items-start gap-2 text-sm text-green-600">
                                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                                    <span>
                                        <strong>Dodano ({result.added.length}):</strong>{' '}
                                        {result.added.slice(0, 5).join(', ')}
                                        {result.added.length > 5 && ` i ${result.added.length - 5} więcej...`}
                                    </span>
                                </div>
                            )}

                            {result.duplicates.length > 0 && (
                                <div className="flex items-start gap-2 text-sm text-amber-600">
                                    <Info className="w-4 h-4 mt-0.5 shrink-0" />
                                    <span>
                                        <strong>Pominięto (już istnieją) ({result.duplicates.length}):</strong>{' '}
                                        {result.duplicates.slice(0, 5).join(', ')}
                                        {result.duplicates.length > 5 && ` i ${result.duplicates.length - 5} więcej...`}
                                    </span>
                                </div>
                            )}

                            {result.errors.length > 0 && (
                                <div className="flex items-start gap-2 text-sm text-red-600">
                                    <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                    <span>
                                        <strong>Błędy:</strong> {result.errors.join(', ')}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleOpenChange(false)}
                        disabled={importing}
                    >
                        {result ? 'Zamknij' : 'Anuluj'}
                    </Button>
                    {!result && (
                        <Button
                            onClick={handleImport}
                            disabled={importing || previewCount === 0}
                        >
                            {importing ? (
                                <>
                                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                    Importowanie...
                                </>
                            ) : (
                                <>
                                    <Upload className="w-4 h-4 mr-2" />
                                    Importuj {previewCount} {previewCount === 1 ? 'słowo' : previewCount < 5 ? 'słowa' : 'słów'}
                                </>
                            )}
                        </Button>
                    )}
                    {result && result.added.length > 0 && (
                        <Button onClick={resetForm}>
                            Importuj kolejne
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
