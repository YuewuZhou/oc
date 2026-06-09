def find_duplicates(items):
    """
    Finds all duplicate values in a list and returns a dictionary
    mapping each duplicate value to the list of indices where it appears.

    Args:
        items (list): A list of items to check for duplicates.

    Returns:
        dict: A dictionary where keys are the duplicate values and values
              are lists of indices (integers) where the duplicate occurs.
    """
    from collections import defaultdict

    indices = defaultdict(list)
    for index, item in enumerate(items):
        indices[item].append(index)

    return {item: idx_list for item, idx_list in indices.items() if len(idx_list) > 1}

# Example 1
# Input: ['a', 'b', 'a', 'c', 'b', 'a']
# Expected Output: {'a': [0, 2, 5], 'b': [1, 4]}
print(f"Example 1: {find_duplicates(['a', 'b', 'a', 'c', 'b', 'a'])}")

# Example 2
# Input: [1, 2, 3, 1, 2, 1]
# Expected Output: {1: [0, 3, 5], 2: [1, 4]}
print(f"Example 2: {find_duplicates([1, 2, 3, 1, 2, 1])}")
