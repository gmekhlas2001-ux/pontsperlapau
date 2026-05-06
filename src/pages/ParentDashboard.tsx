/**
 * Parent Dashboard
 *
 * A read-only portal for parents to monitor their children's academic progress,
 * attendance and outstanding fees. Parents cannot modify any data.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  GraduationCap,
  ClipboardCheck,
  CircleDollarSign,
  AlertTriangle,
  TrendingUp,
  User,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { getMyChildren, type ChildSummary } from '@/services/parentService';
import { getFeesForStudent, type FeeRecord } from '@/services/feeService';

// ─── Child card ────────────────────────────────────────────────────────────────

function ChildCard({ child }: { child: ChildSummary }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const attColor =
    child.attendancePct === null ? 'text-muted-foreground' :
    child.attendancePct >= 80 ? 'text-green-600' :
    child.attendancePct >= 60 ? 'text-amber-600' : 'text-red-600';

  const scoreColor =
    child.averageScore === null ? 'text-muted-foreground' :
    child.averageScore >= 70 ? 'text-green-600' :
    child.averageScore >= 50 ? 'text-amber-600' : 'text-red-600';

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-teal-600 to-teal-700 p-4 text-white">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-lg font-bold">
            {child.studentFirstName[0]}{child.studentLastName[0]}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg truncate">
              {child.studentFirstName} {child.studentLastName}
            </h3>
            <p className="text-teal-100 text-sm">{child.studentCode}</p>
          </div>
          <Badge className="bg-white/20 text-white border-white/30 capitalize shrink-0">
            {t(`parent.relationship.${child.relationship}`, child.relationship)}
          </Badge>
        </div>
        {child.branchName && (
          <p className="text-teal-100 text-sm mt-2">{child.branchName}</p>
        )}
      </div>

      <CardContent className="p-4 space-y-4">
        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <GraduationCap className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">{t('parent.classes')}</p>
            <p className="font-bold text-lg">{child.enrolledClasses}</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <TrendingUp className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">{t('parent.avgScore')}</p>
            <p className={`font-bold text-lg ${scoreColor}`}>
              {child.averageScore !== null ? `${child.averageScore}%` : '—'}
            </p>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <ClipboardCheck className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">{t('parent.attendance')}</p>
            <p className={`font-bold text-lg ${attColor}`}>
              {child.attendancePct !== null ? `${child.attendancePct}%` : '—'}
            </p>
          </div>
        </div>

        {/* Pending fees alert */}
        {child.pendingFeesCount > 0 && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              {t('parent.pendingFees', {
                count: child.pendingFeesCount,
                amount: new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(child.pendingFeesAmount),
              })}
            </span>
          </div>
        )}

        {/* View profile button */}
        <Button
          variant="outline"
          className="w-full justify-between"
          onClick={() => navigate(`/students/${child.studentId}`)}
        >
          {t('parent.viewProfile')}
          <ChevronRight className="w-4 h-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Fee list for a child ──────────────────────────────────────────────────────

function ChildFeesList({ studentId }: { studentId: string }) {
  const { t } = useTranslation();
  const [fees, setFees] = useState<FeeRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getFeesForStudent(studentId).then((res) => {
      setLoading(false);
      if (res.success && res.data) {
        // Only pending/overdue/partial
        setFees(res.data.filter((f) => ['pending', 'overdue', 'partial'].includes(f.status)));
      }
    });
  }, [studentId]);

  if (loading) return null;
  if (fees.length === 0) return (
    <p className="text-sm text-muted-foreground px-1">{t('parent.noFees')}</p>
  );

  const STATUS_COLORS: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800',
    overdue: 'bg-red-100 text-red-800',
    partial: 'bg-blue-100 text-blue-800',
  };

  return (
    <div className="space-y-2">
      {fees.map((fee) => (
        <div key={fee.id} className="flex items-center justify-between p-2 rounded-lg border text-sm">
          <div>
            <p className="font-medium">{fee.description}</p>
            <p className="text-xs text-muted-foreground">
              {t('parent.due')} {new Date(fee.dueDate).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[fee.status] ?? ''}`}>
              {t(`fees.status.${fee.status}`, fee.status)}
            </span>
            <span className="font-mono font-bold">
              {new Intl.NumberFormat(undefined, { style: 'currency', currency: fee.currency }).format(fee.amount)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function ParentDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [children, setChildren] = useState<ChildSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<'overview' | 'fees'>('overview');

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const res = await getMyChildren(user.id);
    setLoading(false);
    if (res.success && res.data) {
      setChildren(res.data);
    } else {
      toast.error(res.error ?? t('parent.errors.load'));
    }
  }, [user?.id, t]);

  useEffect(() => { load(); }, [load]);

  const totalPendingFees = children.reduce((s, c) => s + c.pendingFeesAmount, 0);
  const totalPendingCount = children.reduce((s, c) => s + c.pendingFeesCount, 0);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{t('parent.title')}</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          {t('parent.welcome', { name: user?.firstName ?? '' })}
        </p>
      </div>

      {/* Top alert if fees outstanding */}
      {totalPendingCount > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <CircleDollarSign className="w-4 h-4 shrink-0" />
          <span>
            {t('parent.totalPendingFees', {
              count: totalPendingCount,
              amount: new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(totalPendingFees),
            })}
          </span>
        </div>
      )}

      {/* Tab selector */}
      <div className="flex gap-2 border-b">
        {(['overview', 'fees'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setSelectedTab(tab)}
            className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
              selectedTab === tab
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t(`parent.tabs.${tab}`)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          {t('common.loading')}
        </div>
      ) : children.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <User className="w-12 h-12 opacity-30" />
          <p>{t('parent.noChildren')}</p>
          <p className="text-sm">{t('parent.noChildrenHint')}</p>
        </div>
      ) : selectedTab === 'overview' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {children.map((child) => (
            <ChildCard key={child.studentId} child={child} />
          ))}
        </div>
      ) : (
        /* Fees tab */
        <div className="space-y-6">
          {children.map((child) => (
            <Card key={child.studentId}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CircleDollarSign className="w-4 h-4 text-amber-500" />
                  {child.studentFirstName} {child.studentLastName}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ChildFeesList studentId={child.studentId} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
