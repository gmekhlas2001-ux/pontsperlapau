import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataTable } from './DataTable';

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => true }));

interface PersonRow {
  id: string;
  name: string;
  role: string;
  email: string;
  status: string;
}

describe('DataTable responsive records', () => {
  it('keeps the selected mobile details and action visible in a record card', () => {
    const rows: PersonRow[] = [{
      id: '1',
      name: 'Amina Rahimi',
      role: 'Teacher',
      email: 'amina@example.com',
      status: 'Active',
    }];

    render(
      <DataTable
        data={rows}
        keyExtractor={(row) => row.id}
        searchable={false}
        mobileColumns={['name', 'role', 'status', 'actions']}
        columns={[
          { key: 'name', header: 'Name', sortable: true, cell: (row) => <strong>{row.name}</strong> },
          { key: 'role', header: 'Role', cell: (row) => row.role },
          { key: 'email', header: 'Email', cell: (row) => row.email },
          { key: 'status', header: 'Status', cell: (row) => row.status },
          { key: 'actions', header: 'Actions', cell: (row) => <button aria-label={`Actions for ${row.name}`}>•••</button> },
        ]}
      />,
    );

    const mobileCard = screen.getByRole('article');
    expect(within(mobileCard).getByText('Amina Rahimi')).toBeInTheDocument();
    expect(within(mobileCard).getByText('Teacher')).toBeInTheDocument();
    expect(within(mobileCard).getByText('Active')).toBeInTheDocument();
    expect(within(mobileCard).getByRole('button', { name: 'Actions for Amina Rahimi' })).toBeInTheDocument();
    expect(within(mobileCard).queryByText('amina@example.com')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Sort' })).toBeInTheDocument();
  });
});
