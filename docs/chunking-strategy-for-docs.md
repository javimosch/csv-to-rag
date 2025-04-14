# Chunking Text to Vector

In this article I discuss the reason why chunking is needed and selecting a splitting strategy that matches the needs of the source knowledge base

## Text Splitting Strategy

While the concept of the chunking strategy is easy to understand, there are nuances that affect the accuracy of vector query responses, and there are various chunking strategies that can be used.

## Naïvely splitting with fixed chunk sizes

The simplest approach to creating text chunks is to split a source document into blocks with an appropriate maximum number of bytes in each chunk.  For example, we might use a text splitter that breaks a long document into chunks where each chunk is a fixed number of characters.

The embedding process would then create a single embedding vector for each chunk.  All the chunks would be stored in the vector database, and as users asked about Lincoln's speeches, the vector query would return the original text (and other metadata) for vectors matching the meaning of the user's prompt.

But there's a serious problem with this naïve strategy--do you see it? It's the way text was split into chunk 1 and 2.

Consider the following prompt:

💡
"Has Abraham Lincoln talked about Liberty in any of his speeaches?"
Would the vector search realize the Gettysburg speech does, in fact, include discussion of "Liberty"?  

Probably not. Vector 1 includes the word "Lib", and vector 2 includes the word "erty".  Neither of these are likely to be considered close to the concept "Liberty" in the original prompt.

## Context Overlap strategy 

Clearly, we need a better strategy. There are several approaches, but one that's easy to understand is using context overlap.

In this approach, rather than splitting chunks at exactly the fixed number of characters, we could instead use chunks that overlap from one to the next. In this way, a chunk still may begin or end with a partial word, but the chunk adjacent to it will contain the entire word.

For example, in the following document chunked with overlap, the word "testing" has been split in chunk 3 (to "ing"), but it is fully contained in chunk number 2.  In a search for "testing" vector number 3 wouldn't be returned, but vector 2 would be returned.

While this is a simple example, it illustrates the idea that we need to devise chunking strategies carefully.