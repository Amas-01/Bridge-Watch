import { Link } from "react-router-dom";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useWatchlist } from "../hooks/useWatchlist";

interface SortableItemProps {
  id: string;
  onRemove: (id: string) => void;
}

function SortableAssetItem({ id, onRemove }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between p-3 mb-2 rounded bg-stellar-border shadow-sm border border-transparent hover:border-stellar-blue transition-colors ${
        isDragging ? "ring-2 ring-stellar-blue" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <button
          {...attributes}
          {...listeners}
          className="text-gray-400 hover:text-white cursor-grab active:cursor-grabbing p-1"
          aria-label="Drag handle"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
          </svg>
        </button>
        <Link to={`/assets/${id}`} className="font-bold text-white hover:text-stellar-blue transition-colors">
          {id}
        </Link>
      </div>
      
      <button
        onClick={() => onRemove(id)}
        className="text-gray-400 hover:text-red-400 p-1"
        aria-label={`Remove ${id} from watchlist`}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

interface WatchlistSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WatchlistSidebar({ isOpen, onClose }: WatchlistSidebarProps) {
  const { activeWatchlist, removeAsset, updateAssetOrder } = useWatchlist();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!activeWatchlist || !over || active.id === over.id) {
      return;
    }

    const oldIndex = activeWatchlist.assets.indexOf(active.id as string);
    const newIndex = activeWatchlist.assets.indexOf(over.id as string);

    if (oldIndex !== -1 && newIndex !== -1) {
      const newAssets = arrayMove(activeWatchlist.assets, oldIndex, newIndex);
      updateAssetOrder(activeWatchlist.id, newAssets);
    }
  };

  const handleRemove = (symbol: string) => {
    if (activeWatchlist) {
      removeAsset(symbol, activeWatchlist.id);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div 
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="fixed inset-y-0 right-0 z-50 w-80 bg-stellar-card border-l border-stellar-border shadow-2xl flex flex-col transform transition-transform duration-300">
        <div className="p-4 border-b border-stellar-border flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">
            {activeWatchlist?.name || "Watchlist"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1"
            aria-label="Close sidebar"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {!activeWatchlist || activeWatchlist.assets.length === 0 ? (
            <div className="text-center text-gray-400 mt-10">
              <p>Your watchlist is empty.</p>
              <p className="text-sm mt-2">Add assets by clicking the star icon on any asset page.</p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={activeWatchlist.assets}
                strategy={verticalListSortingStrategy}
              >
                {activeWatchlist.assets.map((asset) => (
                  <SortableAssetItem key={asset} id={asset} onRemove={handleRemove} />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>

        <div className="p-4 border-t border-stellar-border bg-stellar-dark">
          <Link
            to="/watchlist"
            onClick={onClose}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-stellar-blue hover:bg-opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-stellar-blue"
          >
            Manage Watchlists
          </Link>
        </div>
      </div>
    </>
  );
}
