#!/bin/bash

# Directory to search (current directory by default)
DIR="."

# Find all .mmd files and process them
find "$DIR" -type f -name "*.mmd" | while read -r file; do
    # Get the filename without extension
    base_name=$(basename "$file" .mmd)
    dir_name=$(dirname "$file")

    # Output SVG will have same name as input but with .svg extension
    output_file="$dir_name/$base_name.svg"

    echo "Converting $file to $output_file"
    npx -p @mermaid-js/mermaid-cli mmdc -i "$file" -o "$output_file"
done