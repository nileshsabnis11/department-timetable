import { useState } from 'react';
import SectionCard from '../ui/SectionCard';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import { Field, NumberInput, Select, TextInput } from '../ui/inputs';
import { newId } from '../../lib/id';
import { ROOM_TYPES } from '../../data/types';
import CsvImportControls from './CsvImportControls';

const blankRoom = () => ({
  id: newId('ROOM'),
  name: '',
  type: ROOM_TYPES.CLASSROOM,
  capacity: 60,
});

export default function RoomsTab({ rooms, onChange }) {
  const [draft, setDraft] = useState(blankRoom);
  const [error, setError] = useState('');

  const patchRoom = (roomId, patch) =>
    onChange(rooms.map((room) => (room.id === roomId ? { ...room, ...patch } : room)));

  const addRoom = (event) => {
    event.preventDefault();
    if (!draft.name.trim()) {
      setError('Give the room or lab a name.');
      return;
    }
    onChange([...rooms, { ...draft, name: draft.name.trim() }]);
    setDraft(blankRoom());
    setError('');
  };

  return (
    <div className="space-y-5">
      <SectionCard
        title="Add room or lab"
        description="Labs need at least as many rooms as there are parallel batches."
        actions={
          <CsvImportControls
            kind="rooms"
            existingRows={rooms}
            onChange={onChange}
          />
        }
      >
        <form onSubmit={addRoom} className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <Field label="Name" className="lg:flex-1">
            <TextInput
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="e.g. Lab 5 — AI"
            />
          </Field>
          <Field label="Type" className="lg:w-40">
            <Select
              value={draft.type}
              onChange={(event) => setDraft({ ...draft, type: event.target.value })}
            >
              <option value={ROOM_TYPES.CLASSROOM}>Classroom</option>
              <option value={ROOM_TYPES.LAB}>Lab</option>
            </Select>
          </Field>
          <Field label="Capacity" className="lg:w-32">
            <NumberInput
              min="1"
              value={draft.capacity}
              onChange={(event) =>
                setDraft({ ...draft, capacity: Number(event.target.value) || 0 })
              }
            />
          </Field>
          <Button type="submit">Add room</Button>
        </form>
        {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
      </SectionCard>

      <SectionCard
        title="Rooms & labs"
        description="Every scheduling resource available to the generator."
        actions={
          <div className="flex gap-2">
            <Badge tone="indigo">
              {rooms.filter((room) => room.type === ROOM_TYPES.CLASSROOM).length} classrooms
            </Badge>
            <Badge tone="emerald">
              {rooms.filter((room) => room.type === ROOM_TYPES.LAB).length} labs
            </Badge>
          </div>
        }
      >
        {rooms.length === 0 ? (
          <EmptyState
            title="No rooms yet"
            description="Add classrooms and labs above so theory and practical sessions have a place to run."
          />
        ) : (
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-3 font-medium">Name</th>
                  <th className="pb-2 pr-3 font-medium">Type</th>
                  <th className="pb-2 pr-3 font-medium">Capacity</th>
                  <th className="pb-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rooms.map((room) => (
                  <tr key={room.id}>
                    <td className="py-2 pr-3">
                      <TextInput
                        value={room.name}
                        onChange={(event) => patchRoom(room.id, { name: event.target.value })}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <Select
                        value={room.type}
                        onChange={(event) => patchRoom(room.id, { type: event.target.value })}
                      >
                        <option value={ROOM_TYPES.CLASSROOM}>Classroom</option>
                        <option value={ROOM_TYPES.LAB}>Lab</option>
                      </Select>
                    </td>
                    <td className="py-2 pr-3">
                      <NumberInput
                        min="1"
                        className="w-24"
                        value={room.capacity}
                        onChange={(event) =>
                          patchRoom(room.id, { capacity: Number(event.target.value) || 0 })
                        }
                      />
                    </td>
                    <td className="py-2 text-right">
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => onChange(rooms.filter((item) => item.id !== room.id))}
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
