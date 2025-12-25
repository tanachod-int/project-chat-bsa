import { DefaultChatTransport } from 'ai'

type CustomChatTransportOptions = {
  api?: string
  headers?: Record<string, string> | Headers
  credentials?: RequestCredentials
  fetch?: typeof fetch
  onResponse: (response: Response) => void
}

export const createCustomChatTransport = ({
  onResponse,
  ...options
}: CustomChatTransportOptions) => {
  const originalFetch = options.fetch ?? fetch;

  const customFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const response = await originalFetch(input, init);
    onResponse(response.clone())

    return response;
  };

  return new DefaultChatTransport({
    ...options,
    fetch: customFetch,
  })
}