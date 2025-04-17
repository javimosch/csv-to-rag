# OpenAI-like Completion API

This document describes the design of a new API endpoint `/api/completion` that provides LLM completion functionality, mirroring the request/response format of the OpenAI and OpenRouter completion APIs.

## Endpoint

`POST /api/completion`

## Authentication

This endpoint requires Bearer token authentication. You must include a valid API key in the `Authorization` header.

```
Authorization: Bearer YOUR_BACKEND_API_KEY
```

## Request Body

The request body should be a JSON object with the following parameters:

```json
{
  "model": "string", // Required. The model to use for completion (e.g., "openai/gpt-3.5-turbo-instruct", "google/gemini-pro"). This parameter is currently ignored; the system uses the configured LLM models.
  "prompt": "string", // Required. The prompt to generate completions for.
  "max_tokens": "integer", // Optional. The maximum number of tokens to generate.
  "temperature": "number"  // Optional. Sampling temperature, between 0 and 2. Higher values like 0.8 will make the output more random, while lower values like 0.2 will make it more focused and deterministic.
}
```

## Response Body (Success - 200 OK)

The response body is a JSON object with the following structure:

```json
{
  "id": "string",       // Unique ID for the completion.
  "object": "text_completion",
  "created": "integer",  // Timestamp of the completion creation (Unix timestamp).
  "model": "string",      // The model used for completion.
  "choices": [
    {
      "text": "string",      // The generated text.
      "index": "integer",    // The index of the choice in the list of choices.
      "logprobs": "object | null", // Not implemented yet.
      "finish_reason": "string" // The reason the completion finished, e.g., "stop" if the API hit a stop sequence, "length" if `max_tokens` was reached.
    }
  ],
  "usage": {
    "prompt_tokens": "integer",    // The number of tokens in your prompt.
    "completion_tokens": "integer", // The number of tokens in the completion.
    "total_tokens": "integer"      // The total number of tokens used in the request (prompt + completion).
  }
}
```

## Error Responses

The API will return standard HTTP error codes for various issues:

*   **400 Bad Request:**  Indicates missing or invalid parameters in the request body. The response body will include a JSON object with an `error` message.
*   **401 Unauthorized:**  Indicates that the request lacks valid authentication credentials. Ensure you are providing a valid Bearer token.
*   **500 Internal Server Error:**  Indicates an error on the server. The response body will include a JSON object with an `error` message.

## Usage Notes

- The `model` parameter should correspond to a valid model identifier supported by the underlying LLM service (e.g., OpenRouter).
- The `prompt` parameter is the text that the model will use to generate the completion.
- If `max_tokens` is not specified, the model will use a default maximum.
- The `temperature` parameter controls the randomness of the output.
- The LLM completion uses the same logic as the current query route behind the scenes. Therefore, the `model` parameter in the request is ignored, and the system will use the configured LLM models as defined in the environment variables (e.g., `OPENROUTER_MODEL`, `OPENROUTER_MODEL_FALLBACK`).

## Example Request

```bash
curl -X POST \\
     -H "Content-Type: application/json" \\
     -H "Authorization: Bearer YOUR_BACKEND_API_KEY" \\
     -d '{
       "model": "openai/gpt-3.5-turbo-instruct",
       "prompt": "Write a tagline for an ice cream shop",
       "max_tokens": 50,
       "temperature": 0.7
     }' \\
     http://localhost:3000/api/completion
```

## Example Success Response

```json
{
  "id": "cmpl-xxxxxxxxxxxxx",
  "object": "text_completion",
  "created": 1699999999,
  "model": "openai/gpt-3.5-turbo-instruct",
  "choices": [
    {
      "text": "\\n\\nScoops of happiness in every bite!",
      "index": 0,
      "logprobs": null,
      "finish_reason": "length"
    }
  ],
  "usage": {
    "prompt_tokens": 7,
    "completion_tokens": 10,
    "total_tokens": 17
  }
}
