import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataTable } from './DataTable';
import userEvent from '@testing-library/user-event';

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => true }));

interface PersonRow {
  id: string;
  name: string;
  role: string;
  email: string;
  status: string;
}

describe('DataTable responsive records', () => {
  it('returns to the last available page when the dataset shrinks', async () => {
    const user = userEvent.setup();
    const rows = Array.from({ length: 11 }, (_, i) => ({ id: String(i), name: `Person ${i}` }));
    const props = { keyExtractor: (row: typeof rows[number]) => row.id, searchable: false, columns: [{ key: 'name', header: 'Name', cell: (row: typeof rows[number]) => row.name }] };
    const { rerender } = render(<DataTable {...props} data={rows} />);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Person 10')).toBeInTheDocument();
    rerender(<DataTable {...props} data={rows.slice(0, 2)} />);
    expect(screen.getByText('Person 0')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('includes zero-valued fields in search results', async () => {
    const user = userEvent.setup();
    render(<DataTable data={[{ id: 'a', score: 0 }, { id: 'b', score: 5 }]} keyExtractor={row => row.id} searchKeys={['score']} columns={[{ key: 'score', header: 'Score', cell: row => row.score }]} />);
    await user.type(screen.getByRole('textbox'), '0');
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(within(screen.getByRole('article')).getByText('0')).toBeInTheDocument();
  });

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
