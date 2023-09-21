import React, { useEffect, useState } from 'react';

interface TableProps {
    tableSize: number;
    numCellsToUpdate: number;
    runningIndex: number;
}

export function Table({ tableSize, numCellsToUpdate, runningIndex }: TableProps) {
    let [lines, setLines] = useState([]);

    useEffect(() => {
        let tableLines = [];
        for (let x = 0; x < tableSize; x++) {
            tableLines[x] = { id: x, cell: [] };
            for (let y = 0; y < tableSize; y++) {
                tableLines[x].cell[y] = { id: y, value: Math.round(Math.random() * 100) };
            }
        }
        setLines(tableLines);
    }, [tableSize]);

    useEffect(() => {
        setLines((prevLines) => {
            let newLines = [...prevLines];
            for (let i = 0; i < numCellsToUpdate; i++) {
                let x = Math.floor(Math.random() * tableSize);
                let y = Math.floor(Math.random() * tableSize);
                newLines[x].cell = [...newLines[x].cell];
                newLines[x].cell[y].value = Math.round(Math.random() * 100);
            }
            return newLines;
        });
    }, [runningIndex]);

    return (
        <div>
            <table>
                <tbody>
                    {lines.map((line) => (
                        <tr key={line.id}>
                            {line.cell.map((cell) => (
                                <td key={cell.id}>{cell.value}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
