import { useState } from 'react';
import SectionCard from '../ui/SectionCard';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import { Field, TextInput } from '../ui/inputs';
import { newId } from '../../lib/id';

export default function DivisionsTab({ divisions, onChange }) {
  const [newName, setNewName] = useState('');
  const [newBatchCount, setNewBatchCount] = useState(4);

  const patchDivision = (divisionId, patch) =>
    onChange(
      divisions.map((division) =>
        division.id === divisionId ? { ...division, ...patch } : division,
      ),
    );

  const addDivision = (event) => {
    event.preventDefault();
    const name = newName.trim().toUpperCase();
    if (!name) return;
    const count = Math.min(Math.max(Number(newBatchCount) || 0, 0), 8);
    const id = newId('DIV');
    onChange([
      ...divisions,
      {
        id,
        name,
        batches: Array.from({ length: count }, (_, index) => ({
          id: newId('BATCH'),
          name: `${name}-B${index + 1}`,
          strength: 0,
        })),
      },
    ]);
    setNewName('');
  };

  const removeDivision = (divisionId) =>
    onChange(divisions.filter((division) => division.id !== divisionId));

  const addBatch = (division) =>
    patchDivision(division.id, {
      batches: [
        ...division.batches,
        {
          id: newId('BATCH'),
          name: `${division.name || 'DIV'}-B${division.batches.length + 1}`,
          strength: 0,
        },
      ],
    });

  const patchBatch = (division, batchId, patch) =>
    patchDivision(division.id, {
      batches: division.batches.map((batch) =>
        batch.id === batchId ? { ...batch, ...patch } : batch,
      ),
    });

  const removeBatch = (division, batchId) =>
    patchDivision(division.id, {
      batches: division.batches.filter((batch) => batch.id !== batchId),
    });

  return (
    <div className="space-y-5">
      <SectionCard
        title="Add division"
        description="Each division has its own set of parallel lab batches."
      >
        <form onSubmit={addDivision} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Division name" className="sm:w-48">
            <TextInput
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="e.g. BTECH-SY"
            />
          </Field>
          <Field label="Lab batches" className="sm:w-36">
            <TextInput
              type="number"
              min="0"
              max="8"
              value={newBatchCount}
              onChange={(event) => setNewBatchCount(event.target.value)}
            />
          </Field>
          <Button type="submit" className="sm:mb-0">
            Add division
          </Button>
        </form>
      </SectionCard>

      <SectionCard
        title="Divisions & lab batches"
        description="Rename a division or batch by editing the field directly. Batch strength is the headcount used to pick a room/lab that seats everyone; leave it 0 to ignore capacity. Elective groups in the same division are kept in different slots unless you turn that off."
        actions={<Badge>{divisions.length} divisions</Badge>}
      >
        {divisions.length === 0 ? (
          <EmptyState
            title="No divisions yet"
            description="Add a division above, or load the sample SY & TY department from the header."
          />
        ) : null}

        <div className="space-y-3">
          {divisions.map((division) => (
            <div key={division.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <Field label="Division" className="sm:w-52">
                  <TextInput
                    value={division.name}
                    onChange={(event) =>
                      patchDivision(division.id, { name: event.target.value.toUpperCase() })
                    }
                  />
                </Field>
                <div className="flex flex-wrap items-center gap-2 sm:pb-1">
                  <label
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600"
                    title="When on, different elective groups never share a slot, so a student can take one option from each group."
                  >
                    <input
                      type="checkbox"
                      checked={division.separateElectiveGroups !== false}
                      onChange={(event) =>
                        patchDivision(division.id, {
                          separateElectiveGroups: event.target.checked,
                        })
                      }
                      className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    Separate elective groups
                  </label>
                  <Badge tone="indigo">{division.batches.length} batches</Badge>
                  {division.batches.reduce(
                    (sum, batch) => sum + (Number(batch.strength) || 0),
                    0,
                  ) > 0 ? (
                    <Badge tone="emerald">
                      {division.batches.reduce(
                        (sum, batch) => sum + (Number(batch.strength) || 0),
                        0,
                      )}{' '}
                      students
                    </Badge>
                  ) : null}
                  <Button size="sm" variant="secondary" onClick={() => addBatch(division)}>
                    Add batch
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => removeDivision(division.id)}
                  >
                    Remove division
                  </Button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {division.batches.length === 0 ? (
                  <p className="text-xs text-slate-500">No lab batches in this division.</p>
                ) : null}
                {division.batches.map((batch) => (
                  <div
                    key={batch.id}
                    className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 py-1 pl-2 pr-1"
                  >
                    <input
                      value={batch.name}
                      onChange={(event) =>
                        patchBatch(division, batch.id, { name: event.target.value })
                      }
                      aria-label={`Batch name in ${division.name}`}
                      className="w-24 bg-transparent text-sm font-medium text-slate-700 outline-none"
                    />
                    <input
                      type="number"
                      min="0"
                      value={batch.strength || ''}
                      placeholder="0"
                      onChange={(event) =>
                        patchBatch(division, batch.id, {
                          strength: Math.max(0, Number(event.target.value) || 0),
                        })
                      }
                      aria-label={`Batch strength (students) for ${batch.name}`}
                      title="Students in this batch — rooms and labs must seat them"
                      className="w-12 border-l border-slate-200 bg-transparent px-1 text-center text-xs tabular-nums text-slate-600 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => removeBatch(division, batch.id)}
                      aria-label={`Remove ${batch.name}`}
                      className="grid h-6 w-6 place-items-center rounded text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
