# VeriCore AI Architecture

## High-Level Architecture

```text
Next.js
   |
   | HTTPS
   |
Express API
   |
   +---- Authentication
   |
   +---- User Management
   |
   +---- Document Management
   |
   +---- RAG
   |
   +---- Chat
   |
   +---- Payments
   |
   +---- Administration
   |
   +---- Email
   |
   +---- Audit Logs
   |
   +---- MongoDB Atlas
```


## Authentication
```text
Registration
    |
Email OTP
    |
OTP Verification
    |
Password Creation
    |
Account Activation
    |
Login
    |
JWT Access Token
    |
Refresh Token
```

## RAG
```text

PDF
 |
Text extraction
 |
Chunking
 |
Embedding
 |
MongoDB
 |
Vector Search
 |
Context
 |
LLM
 |
Citation-aware answer
```

## Deployment
```text
Vercel
  |
Next.js

Railway
  |
Express

MongoDB Atlas
  |
Database + Vector Search
```