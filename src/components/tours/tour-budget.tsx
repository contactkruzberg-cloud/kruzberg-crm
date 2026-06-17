'use client';

import { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from 'recharts';
import type { Tour, TourStop, TourExpense, ExpenseCategory } from '@/types/database';
import { EXPENSE_CATEGORIES } from '@/types/database';
import { tourBudget, formatKm } from '@/lib/tour-math';
import { useUpdateTour } from '@/hooks/use-tours';
import {
  useTourExpenses,
  useCreateTourExpense,
  useDeleteTourExpense,
} from '@/hooks/use-tour-expenses';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Plus, Trash2, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface TourBudgetProps {
  tour: Tour;
  stops: TourStop[];
}

const euro = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} €`;

export function TourBudget({ tour, stops }: TourBudgetProps) {
  const { data: expenses } = useTourExpenses(tour.id);
  const updateTour = useUpdateTour();
  const createExpense = useCreateTourExpense();
  const deleteExpense = useDeleteTourExpense();

  const budget = tourBudget(tour, stops, expenses || []);

  // editable params buffer
  const [params, setParams] = useState({
    members_count: tour.members_count.toString(),
    fuel_consumption: tour.fuel_consumption.toString(),
    fuel_price: tour.fuel_price.toString(),
    per_diem: tour.per_diem.toString(),
  });

  const saveParam = (key: keyof typeof params, original: number) => {
    const parsed = key === 'members_count' ? parseInt(params[key]) : parseFloat(params[key]);
    if (isNaN(parsed) || parsed === original) return;
    updateTour.mutate({ id: tour.id, [key]: parsed });
  };

  // new expense form
  const [newCategory, setNewCategory] = useState<ExpenseCategory>('toll');
  const [newLabel, setNewLabel] = useState('');
  const [newAmount, setNewAmount] = useState('');

  const addExpense = () => {
    const amount = parseFloat(newAmount);
    if (isNaN(amount)) {
      toast.error('Montant invalide');
      return;
    }
    createExpense.mutate({
      tour_id: tour.id,
      category: newCategory,
      label: newLabel.trim(),
      amount,
    });
    setNewLabel('');
    setNewAmount('');
  };

  const chartData = [
    { name: 'Recettes', value: budget.revenue, fill: '#22c55e' },
    { name: 'Carburant', value: budget.fuel, fill: '#f97316' },
    { name: 'Hôtels', value: budget.hotels, fill: '#8b5cf6' },
    { name: 'Per-diems', value: budget.perDiems, fill: '#eab308' },
    { name: 'Autres', value: budget.otherExpenses, fill: '#64748b' },
  ];

  return (
    <div className="space-y-4">
      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiBox label="Recettes" value={euro(budget.revenue)} accent="text-green-500" />
        <KpiBox label="Carburant" value={euro(budget.fuel)} sub={formatKm(budget.km)} />
        <KpiBox label="Hôtels" value={euro(budget.hotels)} />
        <KpiBox label="Per-diems" value={euro(budget.perDiems)} />
        <KpiBox label="Autres" value={euro(budget.otherExpenses)} />
        <KpiBox
          label="Net"
          value={`${budget.net >= 0 ? '+' : ''}${euro(budget.net)}`}
          accent={budget.net >= 0 ? 'text-green-500' : 'text-red-500'}
          icon={budget.net >= 0 ? 'up' : 'down'}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Coût net par personne :{' '}
        <span className={cn('font-semibold', budget.perPerson >= 0 ? 'text-green-500' : 'text-red-500')}>
          {budget.perPerson >= 0 ? '+' : ''}
          {euro(budget.perPerson)}
        </span>{' '}
        · {tour.members_count} personne{tour.members_count > 1 ? 's' : ''}
      </p>

      {/* chart */}
      <Card className="p-4">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={50} />
              <RechartsTooltip
                formatter={(v) => euro(Number(v))}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* params */}
      <Card className="p-4 space-y-3">
        <h3 className="text-sm font-medium">Paramètres de calcul</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {([
            ['members_count', 'Personnes', tour.members_count],
            ['fuel_consumption', 'Conso (L/100km)', tour.fuel_consumption],
            ['fuel_price', 'Carburant (€/L)', tour.fuel_price],
            ['per_diem', 'Per-diem (€/j/pers)', tour.per_diem],
          ] as const).map(([key, label, original]) => (
            <div key={key} className="space-y-1">
              <Label className="text-xs text-muted-foreground">{label}</Label>
              <Input
                type="number"
                step={key === 'members_count' ? '1' : '0.1'}
                value={params[key]}
                onChange={(e) => setParams((p) => ({ ...p, [key]: e.target.value }))}
                onBlur={() => saveParam(key, original)}
                className="h-8 text-sm"
              />
            </div>
          ))}
        </div>
      </Card>

      {/* expenses */}
      <Card className="p-4 space-y-3">
        <h3 className="text-sm font-medium">Dépenses ponctuelles</h3>
        <div className="space-y-1.5">
          {(expenses || []).map((exp) => (
            <ExpenseRow key={exp.id} expense={exp} onDelete={() => deleteExpense.mutate({ id: exp.id, tourId: tour.id })} />
          ))}
          {(expenses || []).length === 0 && (
            <p className="text-xs text-muted-foreground py-2">
              Aucune dépense ponctuelle. Le carburant, les hôtels et les per-diems sont déjà calculés
              automatiquement ci-dessus.
            </p>
          )}
        </div>

        {/* add expense */}
        <div className="flex gap-2 flex-wrap items-end pt-2 border-t">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Catégorie</Label>
            <Select value={newCategory} onValueChange={(v) => setNewCategory(v as ExpenseCategory)}>
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((c) => (
                  <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 flex-1 min-w-[120px]">
            <Label className="text-[10px] text-muted-foreground">Libellé</Label>
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Péage A7, repas..."
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Montant €</Label>
            <Input
              type="number"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addExpense()}
              placeholder="0"
              className="h-8 text-sm w-24"
            />
          </div>
          <Button size="sm" className="gap-1.5 h-8" onClick={addExpense}>
            <Plus className="h-3.5 w-3.5" />
            Ajouter
          </Button>
        </div>
      </Card>
    </div>
  );
}

function KpiBox({
  label,
  value,
  sub,
  accent,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  icon?: 'up' | 'down';
}) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        {icon === 'up' && <TrendingUp className="h-3 w-3 text-green-500" />}
        {icon === 'down' && <TrendingDown className="h-3 w-3 text-red-500" />}
        {label}
      </div>
      <div className={cn('text-base font-bold mt-0.5', accent)}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </Card>
  );
}

function ExpenseRow({ expense, onDelete }: { expense: TourExpense; onDelete: () => void }) {
  const cat = EXPENSE_CATEGORIES.find((c) => c.key === expense.category);
  return (
    <div className="flex items-center gap-2 text-sm py-1">
      <span className="text-xs text-muted-foreground w-20 shrink-0">{cat?.label}</span>
      <span className="flex-1 truncate">{expense.label || '—'}</span>
      <span className="font-medium">{euro(expense.amount)}</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-muted-foreground hover:text-destructive"
        onClick={onDelete}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
