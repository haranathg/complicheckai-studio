import { useState } from 'react';
import { validateAccessKey, setAuthenticated } from '../utils/auth';
import bundabergLogo from '../assets/bundaberg.jpeg';

interface LoginPageProps {
  onAuthenticated: () => void;
}

export default function LoginPage({ onAuthenticated }: LoginPageProps) {
  const [accessKey, setAccessKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsValidating(true);

    // Small delay to prevent brute force
    await new Promise(resolve => setTimeout(resolve, 500));

    if (validateAccessKey(accessKey)) {
      setAuthenticated();
      onAuthenticated();
    } else {
      setError('Invalid access key. Please check and try again.');
      setIsValidating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8">
        {/* Logo and Header */}
        <div className="flex flex-col items-center mb-8">
          <img
            src={bundabergLogo}
            alt="Logo"
            className="w-24 h-24 object-contain rounded-lg mb-4"
          />
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-800">
              Doc Scan Studio
            </h1>
            <p className="text-sm font-semibold text-gray-600">
              CompliCheck<span className="text-green-600">AI</span><span className="text-[10px] align-super">™</span>
            </p>
          </div>
        </div>

        {/* Description */}
        <div className="text-center mb-8">
          <p className="text-gray-600 text-sm">
            AI-powered document compliance checking for building consent applications.
          </p>
          <p className="text-gray-500 text-xs mt-2">
            This is a preview version. Enter your access key to continue.
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="accessKey" className="block text-sm font-medium text-gray-700 mb-1">
              Access Key
            </label>
            <input
              type="password"
              id="accessKey"
              value={accessKey}
              onChange={(e) => setAccessKey(e.target.value)}
              placeholder="Enter your access key"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              disabled={isValidating}
              autoFocus
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!accessKey.trim() || isValidating}
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {isValidating ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                Validating...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                Access Preview
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t text-center">
          <p className="text-xs text-gray-400">
            Powered by CompliCheck<span className="text-green-600 font-medium">AI</span>™ from UrbanCompass
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Need access? Contact your administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
