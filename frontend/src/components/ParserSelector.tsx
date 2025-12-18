import { useTheme } from '../contexts/ThemeContext';

interface ParserOption {
  id: string;
  name: string;
  description: string;
  envFlag?: string; // Environment variable to check if enabled
  model?: string; // For Bedrock, the specific model ID
}

const ALL_PARSERS: ParserOption[] = [
  {
    id: 'landing_ai',
    name: 'Landing AI',
    description: 'Document parsing with grounding',
    // Always enabled - no flag needed
  },
  {
    id: 'claude_vision',
    name: 'Claude Vision',
    description: 'Vision-based document parsing',
    envFlag: 'VITE_ENABLE_CLAUDE_VISION',
  },
  {
    id: 'gemini_vision',
    name: 'Gemini Vision',
    description: 'Google Gemini vision-based parsing',
    envFlag: 'VITE_ENABLE_GEMINI_VISION',
  },
  // Individual Bedrock models as separate parser options
  {
    id: 'bedrock_claude_sonnet',
    name: 'Bedrock Sonnet 3.5',
    description: 'AWS Bedrock Claude Sonnet 3.5',
    envFlag: 'VITE_ENABLE_BEDROCK_CLAUDE',
    model: 'bedrock-claude-sonnet-3.5',
  },
  {
    id: 'bedrock_claude_opus',
    name: 'Bedrock Opus 3',
    description: 'AWS Bedrock Claude Opus 3',
    envFlag: 'VITE_ENABLE_BEDROCK_CLAUDE',
    model: 'bedrock-claude-opus-3',
  },
  {
    id: 'bedrock_nova_pro',
    name: 'Bedrock Nova Pro',
    description: 'AWS Bedrock Nova Pro',
    envFlag: 'VITE_ENABLE_BEDROCK_CLAUDE',
    model: 'bedrock-nova-pro',
  },
];

// Filter parsers based on environment flags
const getEnabledParsers = (): ParserOption[] => {
  return ALL_PARSERS.filter(parser => {
    // Always include parsers without a flag
    if (!parser.envFlag) return true;
    // Check if the env flag is set to 'true'
    const envValue = import.meta.env[parser.envFlag];
    return envValue === 'true' || envValue === true;
  });
};

// Get the model for a parser (for Bedrock parsers)
export function getModelForParser(parserId: string): string | undefined {
  const parser = ALL_PARSERS.find(p => p.id === parserId);
  return parser?.model;
}

// Check if parser is a Bedrock parser
export function isBedrockParser(parserId: string): boolean {
  return parserId.startsWith('bedrock_');
}

// Get the actual parser type to send to backend
export function getParserType(parserId: string): string {
  if (parserId.startsWith('bedrock_')) {
    return 'bedrock_claude';
  }
  return parserId;
}

interface ParserSelectorProps {
  selectedParser: string;
  onParserChange: (parser: string) => void;
}

export default function ParserSelector({ selectedParser, onParserChange }: ParserSelectorProps) {
  const { isDark } = useTheme();
  const enabledParsers = getEnabledParsers();
  const currentParser = enabledParsers.find(p => p.id === selectedParser) || enabledParsers[0];

  // If no parsers are available, don't show the selector
  if (enabledParsers.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      <select
        value={selectedParser}
        onChange={(e) => onParserChange(e.target.value)}
        className={`appearance-none border rounded-lg px-3 py-1.5 pr-8 text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-500 transition-colors ${
          isDark
            ? 'bg-slate-800/60 border-slate-600/50 text-gray-300 hover:bg-slate-700/60'
            : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
        }`}
        title={`${currentParser.name}: ${currentParser.description}`}
      >
        {enabledParsers.map((parser) => (
          <option key={parser.id} value={parser.id} className={isDark ? 'bg-slate-800 text-gray-300' : 'bg-white text-slate-700'}>
            {parser.name}
          </option>
        ))}
      </select>
      <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
        <svg className={`w-4 h-4 ${isDark ? 'text-gray-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  );
}
