'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowPathIcon } from "@heroicons/react/24/outline";

type PageSize = 'a4' | 'letter' | 'custom';

// Helper function to generate a valid filename from URL
const generateFilenameFromUrl = (url: string): string => {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace('www.', '');
    const pathname = urlObj.pathname;
    
    let filename = hostname;
    
    if (pathname && pathname !== '/') {
      const cleanPath = pathname.replace(/^\/|\/$/g, '').replace(/\//g, '-');
      filename += `-${cleanPath}`;
    }
    
    filename = filename
      .replace(/[^a-zA-Z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 100);
    return filename || 'page';
  } catch (error) {
    console.error('Error generating filename:', error);
    return 'page';
  }
};

// IndexedDB cache management
const initializeDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('pdfCache', 1);
    
    request.onerror = () => reject(new Error('Failed to open database'));
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('pdfs')) {
        const store = db.createObjectStore('pdfs', { keyPath: 'cacheKey' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
    
    request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);
  });
};

const generateCacheKey = (url: string, pageSize: PageSize): string => {
  return `${url}|${pageSize}`;
};

const savePdfToCache = async (url: string, pageSize: PageSize, blob: Blob): Promise<void> => {
  try {
    const db = await initializeDB();
    const tx = db.transaction('pdfs', 'readwrite');
    const store = tx.objectStore('pdfs');
    
    const cacheEntry = {
      cacheKey: generateCacheKey(url, pageSize),
      url,
      pageSize,
      blob,
      timestamp: Date.now()
    };
    
    await new Promise<void>((resolve, reject) => {
      const request = store.put(cacheEntry);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to save PDF to cache'));
    });
  } catch (error) {
    console.error('Error saving to cache:', error);
  }
};

const getPdfFromCache = async (url: string, pageSize: PageSize): Promise<Blob | null> => {
  try {
    const db = await initializeDB();
    const tx = db.transaction('pdfs', 'readonly');
    const store = tx.objectStore('pdfs');
    const cacheKey = generateCacheKey(url, pageSize);
    
    const result = await new Promise<any>((resolve, reject) => {
      const request = store.get(cacheKey);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Failed to get PDF from cache'));
    });
    
    return result?.blob || null;
  } catch (error) {
    console.error('Error retrieving from cache:', error);
    return null;
  }
};

export default function Home() {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState<PageSize>('a4');
  const [conversionCount, setConversionCount] = useState(0);
  const [cacheStatus, setCacheStatus] = useState<'hit' | 'miss' | null>(null);

  useEffect(() => {
    const count = localStorage.getItem('conversionCount');
    if (count) {
      setConversionCount(parseInt(count, 10));
    }
  }, []);

  const updateConversionCount = useCallback(() => {
    const newCount = conversionCount + 1;
    setConversionCount(newCount);
    localStorage.setItem('conversionCount', newCount.toString());
  }, [conversionCount]);

  const handleDownload = useCallback(async (blob: Blob, url: string) => {
    const downloadUrl = URL.createObjectURL(blob);
    const filename = `${generateFilenameFromUrl(url)}.pdf`;

    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setIsLoading(true);
    setError(null);
    setCacheStatus(null);

    try {
      // Check cache first
      const cachedPdf = await getPdfFromCache(url, pageSize);
      
      if (cachedPdf) {
        // Use cached PDF if available
        setCacheStatus('hit');
        await handleDownload(cachedPdf, url);
      } else {
        // Otherwise fetch from server
        setCacheStatus('miss');
        const response = await fetch('/api/pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, pageSize }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to generate PDF');
        }

        const blob = await response.blob();
        
        // Save to cache
        await savePdfToCache(url, pageSize, blob);
        
        await handleDownload(blob, url);
      }
      
      updateConversionCount();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [url, pageSize, handleDownload, updateConversionCount]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#282a36] text-[#ffb86c] font-mono">
        <div className="text-center">
          <ArrowPathIcon className="mx-auto h-8 w-8 animate-spin" />
          <p className="mt-2">$ Converting URL to PDF...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#282a36] text-[#ffb86c] font-mono p-8">
      <div className="max-w-3xl mx-auto">
        <header className="mb-12 border-b border-[#ffb86c]/20 pb-4">
          <h1 className="text-2xl font-bold">$ URL to PDF Converter</h1>
          <p className="mt-2 text-[#ffb86c]/60">
            {'>'} Convert any webpage to a downloadable PDF file
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="space-y-4">
            <label htmlFor="url" className="block text-sm">
              $ Enter URL:
            </label>
            <div className="flex gap-2">
              <Input
                id="url"
                type="url"
                placeholder="https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                className="flex-1 bg-[#282a36] border-[#ffb86c]/20 text-[#ffb86c] placeholder-[#ffb86c]/40 focus:border-[#ffb86c] focus:ring-[#ffb86c]/20 font-mono"
              />
              <Button 
                type="submit" 
                disabled={isLoading}
                className="bg-[#ffb86c]/10 text-[#ffb86c] border border-[#ffb86c]/20 hover:bg-[#ffb86c]/20 hover:border-[#ffb86c]/40 cursor-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmI4NmMiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMTIgMTJtLTkgMGE5IDkgMCAxIDAgMTggMGE5IDkgMCAxIDAgLTE4IDAiLz48L3N2Zz4='),auto]"
              >
                {isLoading ? (
                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                ) : (
                  'Convert'
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <label className="block text-sm">
              $ Select Page Size:
            </label>
            <Tabs
              value={pageSize}
              onValueChange={(value) => setPageSize(value as PageSize)}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-3 bg-[#282a36] border border-[#ffb86c]/20">
                <TabsTrigger 
                  value="a4" 
                  className="data-[state=active]:bg-[#ffb86c]/10 data-[state=active]:text-[#ffb86c] data-[state=active]:border-[#ffb86c]/40 cursor-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmI4NmMiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMTIgMTJtLTkgMGE5IDkgMCAxIDAgMTggMGE5IDkgMCAxIDAgLTE4IDAiLz48L3N2Zz4='),auto]"
                >
                  A4
                </TabsTrigger>
                <TabsTrigger 
                  value="letter"
                  className="data-[state=active]:bg-[#ffb86c]/10 data-[state=active]:text-[#ffb86c] data-[state=active]:border-[#ffb86c]/40 cursor-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmI4NmMiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMTIgMTJtLTkgMGE5IDkgMCAxIDAgMTggMGE5IDkgMCAxIDAgLTE4IDAiLz48L3N2Zz4='),auto]"
                >
                  Letter
                </TabsTrigger>
                <TabsTrigger 
                  value="custom"
                  className="data-[state=active]:bg-[#ffb86c]/10 data-[state=active]:text-[#ffb86c] data-[state=active]:border-[#ffb86c]/40 cursor-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmI4NmMiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMTIgMTJtLTkgMGE5IDkgMCAxIDAgMTggMGE5IDkgMCAxIDAgLTE4IDAiLz48L3N2Zz4='),auto]"
                >
                  Custom
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </form>

        {error && (
          <div className="mt-8 p-4 border border-[#ff5555]/20 bg-[#ff5555]/10 text-[#ff5555]">
            $ Error: {error}
          </div>
        )}

        {cacheStatus && (
          <div className={`mt-8 p-4 border ${cacheStatus === 'hit' ? 'border-[#50fa7b]/20 bg-[#50fa7b]/10 text-[#50fa7b]' : 'border-[#8be9fd]/20 bg-[#8be9fd]/10 text-[#8be9fd]'}`}>
            $ Cache {cacheStatus === 'hit' ? 'hit: PDF loaded from local storage' : 'miss: PDF generated from server'}
          </div>
        )}

        <div className="mt-12 text-sm text-[#ffb86c]/60 border-t border-[#ffb86c]/20 pt-4">
          <p>$ Conversions today: {conversionCount}</p>
        </div>
      </div>
    </div>
  );
}
