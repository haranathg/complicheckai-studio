interface ModelOption {
  id: string;
  name: string;
  description: string;
  inputCost: number;
  outputCost: number;
}

const MODELS: ModelOption[] = [
  {
    id: 'claude-sonnet-4-20250514',
    name: 'Sonnet 4',
    description: 'Balanced speed & quality',
    inputCost: 3,
    outputCost: 15,
  },
  {
    id: 'claude-opus-4-20250514',
    name: 'Opus 4',
    description: 'Highest quality',
    inputCost: 15,
    outputCost: 75,
  },
  {
    id: 'claude-3-5-sonnet-20241022',
    name: 'Sonnet 3.5',
    description: 'Previous generation',
    inputCost: 3,
    outputCost: 15,
  },
  {
    id: 'claude-3-haiku-20240307',
    name: 'Haiku 3',
    description: 'Fastest & cheapest',
    inputCost: 0.25,
    outputCost: 1.25,
  },
];

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
}

export default function ModelSelector({ selectedModel, onModelChange }: ModelSelectorProps) {
  const currentModel = MODELS.find(m => m.id === selectedModel) || MODELS[0];

  return (
    <div className="relative">
      <select
        value={selectedModel}
        onChange={(e) => onModelChange(e.target.value)}
        className="appearance-none bg-gray-100 border border-gray-200 rounded-lg px-3 py-1.5 pr-8 text-sm text-gray-700 cursor-pointer hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
        title={`${currentModel.name}: ${currentModel.description} ($${currentModel.inputCost}/$${currentModel.outputCost} per 1M tokens)`}
      >
        {MODELS.map((model) => (
          <option key={model.id} value={model.id}>
            {model.name} - ${model.inputCost}/${model.outputCost}
          </option>
        ))}
      </select>
      <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  );
}
