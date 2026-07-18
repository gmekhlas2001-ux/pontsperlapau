import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Inbox, Search, SearchX } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

interface Column<T> {
  key: string;
  header: string;
  cell: (item: T) => React.ReactNode;
  sortable?: boolean;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (item: T) => string;
  searchable?: boolean;
  searchKeys?: (keyof T)[];
  pageSizeOptions?: number[];
  defaultPageSize?: number;
  mobileColumns?: string[];
  className?: string;
}

export function DataTable<T>({
  data,
  columns,
  keyExtractor,
  searchable = true,
  searchKeys = [],
  pageSizeOptions = [10, 25, 50],
  defaultPageSize = 10,
  mobileColumns,
  className,
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: 'asc' | 'desc';
  } | null>(null);

  const filteredData = useMemo(() => {
    if (!searchQuery || searchKeys.length === 0) return data;
    
    const query = searchQuery.toLowerCase();
    return data.filter((item) =>
      searchKeys.some((key) => {
        const value = item[key];
        return value && String(value).toLowerCase().includes(query);
      })
    );
  }, [data, searchQuery, searchKeys]);

  const sortedData = useMemo(() => {
    if (!sortConfig) return filteredData;
    
    return [...filteredData].sort((a, b) => {
      const aRecord = a as Record<string, string | number>;
      const bRecord = b as Record<string, string | number>;
      const aValue = aRecord[sortConfig.key];
      const bValue = bRecord[sortConfig.key];
      
      if (aValue === undefined || bValue === undefined) return 0;
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const paginatedData = sortedData.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleSort = (key: string) => {
    setSortConfig((current) => {
      if (!current || current.key !== key) {
        return { key, direction: 'asc' };
      }
      if (current.direction === 'asc') {
        return { key, direction: 'desc' };
      }
      return null;
    });
  };

  const startEntry = sortedData.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endEntry = Math.min(currentPage * pageSize, sortedData.length);
  const isFilteredEmpty = data.length > 0 && filteredData.length === 0;
  const visibleMobileColumns = mobileColumns?.length
    ? columns.filter((column) => mobileColumns.includes(column.key))
    : columns.filter((_, index) => index < 3 || index === columns.length - 1);
  const primaryMobileColumn = visibleMobileColumns[0];
  const actionMobileColumn = visibleMobileColumns.find((column) => column.key === 'actions');
  const detailMobileColumns = visibleMobileColumns.filter((column) => (
    column !== primaryMobileColumn && column !== actionMobileColumn
  ));
  const sortableColumns = columns.filter((column) => column.sortable);

  return (
    <div className={cn('space-y-4', className)}>
      {searchable && (
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('common.search')}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="ps-10"
            />
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border/70 bg-card/85 shadow-xs">
        {isMobile ? (
          <div>
            {sortableColumns.length > 0 && (
              <div className="border-b border-border/70 p-3">
                <Select
                  value={sortConfig ? `${sortConfig.key}:${sortConfig.direction}` : 'none'}
                  onValueChange={(value) => {
                    if (value === 'none') {
                      setSortConfig(null);
                    } else {
                      const [key, direction] = value.split(':');
                      setSortConfig({ key, direction: direction as 'asc' | 'desc' });
                    }
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="w-full" aria-label={t('common.sort')}>
                    <SelectValue placeholder={t('common.sort')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('common.sort')}</SelectItem>
                    {sortableColumns.flatMap((column) => [
                      <SelectItem key={`${column.key}:asc`} value={`${column.key}:asc`}>
                        {column.header} ↑
                      </SelectItem>,
                      <SelectItem key={`${column.key}:desc`} value={`${column.key}:desc`}>
                        {column.header} ↓
                      </SelectItem>,
                    ])}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="divide-y divide-border/70">
              {paginatedData.length === 0 ? (
                <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
                  <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    {isFilteredEmpty ? <SearchX className="h-5 w-5" /> : <Inbox className="h-5 w-5" />}
                  </span>
                  <p className="text-sm font-semibold text-foreground">
                    {isFilteredEmpty ? t('common.noMatchingResults') : t('common.noData')}
                  </p>
                  <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
                    {isFilteredEmpty
                      ? t('common.noMatchingResultsDescription')
                      : t('common.emptyTableDescription')}
                  </p>
                </div>
              ) : (
                paginatedData.map((item) => (
                  <article key={keyExtractor(item)} className="p-4 transition-colors active:bg-muted/35">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        {primaryMobileColumn?.cell(item)}
                      </div>
                      {actionMobileColumn && (
                        <div className="-me-1 -mt-1 shrink-0">{actionMobileColumn.cell(item)}</div>
                      )}
                    </div>
                    {detailMobileColumns.length > 0 && (
                      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                        {detailMobileColumns.map((column) => (
                          <div key={`${keyExtractor(item)}-${column.key}`} className="min-w-0">
                            <dt className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {column.header}
                            </dt>
                            <dd className="min-w-0 break-words text-sm text-foreground">{column.cell(item)}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </article>
                ))
              )}
            </div>
          </div>
        ) : (
          <div>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/45 hover:bg-muted/45">
                  {columns.map((column) => (
                    <TableHead
                      key={column.key}
                      className="font-semibold text-foreground"
                      aria-sort={column.sortable && sortConfig?.key === column.key
                        ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending')
                        : undefined}
                    >
                      {column.sortable ? (
                        <button
                          type="button"
                          className="flex min-h-10 items-center gap-1 rounded-sm text-start outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => handleSort(column.key)}
                        >
                          {column.header}
                          {sortConfig?.key === column.key && (
                            <span aria-hidden="true">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </button>
                      ) : column.header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
            {paginatedData.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-56 text-center"
                >
                  <div className="mx-auto flex max-w-sm flex-col items-center px-6">
                    <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                      {isFilteredEmpty ? <SearchX className="h-5 w-5" /> : <Inbox className="h-5 w-5" />}
                    </span>
                    <p className="text-sm font-semibold text-foreground">
                      {isFilteredEmpty ? t('common.noMatchingResults') : t('common.noData')}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {isFilteredEmpty
                        ? t('common.noMatchingResultsDescription')
                        : t('common.emptyTableDescription')}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginatedData.map((item) => (
                <TableRow key={keyExtractor(item)} className="transition-colors hover:bg-muted/35">
                  {columns.map((column) => (
                    <TableCell key={`${keyExtractor(item)}-${column.key}`}>
                      {column.cell(item)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{t('common.show')}</span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              setPageSize(Number(value));
              setCurrentPage(1);
            }}
          >
            <SelectTrigger className="w-16">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span>{t('common.entries')}</span>
          <span className="basis-full text-xs sm:basis-auto sm:text-sm">
            {t('common.from')} {startEntry} {t('common.to')} {endEntry} {t('common.of')}{' '}
            {sortedData.length}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <Button
            variant="outline"
            size="sm"
            aria-label={t('common.previous')}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm">
            {t('common.page')} {currentPage} {t('common.of')} {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            aria-label={t('common.next')}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
