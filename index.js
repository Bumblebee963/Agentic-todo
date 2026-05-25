import {db} from './db/index.js';
import {todosTable} from './db/schema.js';
import { ilike,eq } from 'drizzle-orm';
import Cerebras from '@cerebras/cerebras_cloud_sdk';
import readlineSync from 'readline-sync';
import 'dotenv/config';

const client = new Cerebras({
  apiKey: process.env['CEREBRAS_API_KEY'],
});

//tools

async function getAllTodos() {
    const todos = await db.select().from(todosTable);
    return todos;
}

async function createTodo(todo) {
    const [newTodo] = await db.insert(todosTable).values({todo}).returning({
        id: todosTable.id,
    });
    return newTodo.id;
}

async function searchTodo(search) {
    const todos = await db.select().from(todosTable).where(ilike(todosTable.todo, `%${search}%`));
    return todos;
}

async function deleteTodoById(id) {
    await db.delete(todosTable).where(eq(todosTable.id, id));
}

const tools={
    getAllTodos,
    createTodo,
    searchTodo,
    deleteTodoById
}

const SYSTEM_PROMPT = `

You are an AI To-Do List Assistant with START, PLAN, ACTION, Observation and Output State.
Wait for the user prompt and first PLAN using available tools.
After Planning, Take the action with appropriate tools and wait for Observation based on Action.
Once you get the observations, Return the AI response based on START prompt and observations.

You can manage tasks by adding, viewing, updating, and deleting tasks.
You must strictly follow the JSON output format.

Todo DB Schema:
id: Int and Primary Key
todo: String
created_at: Date Time
updated_at: Date Time

Available Tools:

getAllTodos(): Returns all the Todos from Database
createTodo(todo: string): Creates a new Todo in the DB and takes todo as a string
deleteTodoById(id: string): Deleted the todo by ID given in the DB
searchTodo(query: string): Searches for all todos matching teh query string using iLike in DB

Example:

START
{ "type": "user", "user": "Add a task for shopping groceries." }
{ "type": "plan", "plan": "I will try to get more context on what user needs to shop." }
{ "type": "output", "output": "Can you tell me what all items you want to shop for?" }
{ "type": "user", "user": "I want to shop for milk, kurkure, lays and choco." }
{ "type": "plan", "plan": "I will use createTodo to create a new Todo in DB." }
{ "type": "action", "function": "createTodo", "input": "Shopping for milk, kurkure, lays and choco." }
{ "type": "observation", "observation": "2" }
 {"type": "output", "output": "Your todo has been added successfully!"}
`

const messages=[
    { role: 'system', content: SYSTEM_PROMPT },
]

while(true){
    const query=readlineSync.question('>> ');
    const q={
        type: 'user',
        user: query,
    }

    messages.push({ role: 'user', content: JSON.stringify(q) });

    while(true){
        const chat = await client.chat.completions.create({
            model: 'gpt-oss-120b',
            messages: messages,
            response_format: { type: 'json_object' },
        });

        const result = chat.choices[0].message.content;
        messages.push({ role: 'assistant', content: result });

        console.log(`\n\n------------------AI RESPONSE START------------------`);
        console.log(result);
        console.log(`------------------AI RESPONSE END------------------\n\n`);

        const action = JSON.parse(result);

        if(action.type=='output'){
            console.log(`🤖: ${action.output}`);
            break;
        }else if(action.type=='action'){
            const fn=tools[action.function];
            if(!fn){
                throw new Error(`Function ${action.function} not found in tools`);
            }
            const observation=await fn(action.input);

            const obs={
                type: 'observation',
                observation: observation,
            }

            messages.push({
                role: 'user',
                content: JSON.stringify(obs),
            })
        }
    }
}
